// Separa las imágenes de producto que hoy están COMPARTIDAS: varias filas de `products`
// apuntando al mismo archivo del bucket.
//
// Vienen de versiones viejas de la herencia por código de barras, que guardaba la misma URL
// en el producto nuevo en vez de copiar el archivo. Mientras sigan compartidas, borrar o
// reemplazar la foto de un producto le borra la foto al otro —normalmente de otra empresa—,
// que queda con la imagen rota y sin forma de recuperarla.
//
// Deja al dueño más antiguo (menor id) con el archivo original y le da a cada uno de los
// demás una copia propia dentro del bucket. No borra nada: si algo falla a mitad, lo peor
// que queda son copias de más, nunca una imagen menos.
//
// Uso (por defecto solo informa; hay que pedirle que escriba):
//   node src/scripts/desduplicarImagenesProductos.js
//   node src/scripts/desduplicarImagenesProductos.js --apply
//
// Necesita las variables de la nube: SUPABASE_URL, SUPABASE_SERVICE_KEY y los DB_* del
// Postgres de Supabase (con DB_SSL=true). En local (sin SUPABASE_URL) no tiene nada que
// hacer: allá los archivos viven en el volumen de uploads y este script no los toca.
require("dotenv").config();

const path = require("path");
const { sequelize, Sequelize } = require("../models");

const APLICAR = process.argv.includes("--apply");

async function main() {
  if (!process.env.SUPABASE_URL) {
    console.error("Este script es solo para el modo nube: falta SUPABASE_URL.");
    process.exit(1);
  }
  const { copyImage } = require("../config/supabase");

  // Consulta directa, sin modelos: los hooks de Sequelize filtran por empresa y aquí hace
  // falta ver a los dos dueños a la vez, que justamente son de empresas distintas.
  const [grupos] = await sequelize.query(`
    SELECT image_filename,
           array_agg(id ORDER BY id)         AS ids,
           array_agg(company_id ORDER BY id) AS empresas
      FROM products
     WHERE image_filename IS NOT NULL
       AND image_filename <> ''
       AND image_filename LIKE 'http%'
     GROUP BY image_filename
    HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC
  `);

  if (!grupos.length) {
    console.log("No hay imágenes compartidas. Nada que hacer.");
    return;
  }

  const aCopiar = grupos.reduce((n, g) => n + g.ids.length - 1, 0);
  console.log(`${grupos.length} archivos compartidos por ${aCopiar + grupos.length} productos.`);
  console.log(`Se harían ${aCopiar} copias (el producto más antiguo de cada grupo se queda con el original).`);
  if (!APLICAR) {
    console.log("\nModo informe. Para aplicarlo: node src/scripts/desduplicarImagenesProductos.js --apply");
    for (const g of grupos.slice(0, 20)) {
      console.log(`  ids ${g.ids.join(", ")} (empresas ${[...new Set(g.empresas)].join(", ")}) → ${g.image_filename.split("/").pop()}`);
    }
    return;
  }

  let copiadas = 0, fallidas = 0;
  for (const g of grupos) {
    const origen = decodeURIComponent(new URL(g.image_filename).pathname.split("/").pop() || "");
    if (!origen) { fallidas += g.ids.length - 1; continue; }
    const ext = path.extname(origen).toLowerCase() || ".jpg";

    // El primero (id menor) conserva el archivo tal cual; los demás reciben copia.
    for (const id of g.ids.slice(1)) {
      try {
        const destino = `product_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        const url = await copyImage(origen, destino);
        await sequelize.query(
          "UPDATE products SET image_filename = :url WHERE id = :id",
          { replacements: { url, id }, type: Sequelize.QueryTypes.UPDATE }
        );
        copiadas++;
      } catch (err) {
        // Un archivo que ya no está en el bucket (borrado por el bug que esto viene a
        // frenar) no se puede copiar. Se informa y se sigue: el resto sí tiene arreglo.
        console.error(`  producto ${id}: ${err.message}`);
        fallidas++;
      }
    }
  }

  console.log(`\nListo. ${copiadas} copias hechas, ${fallidas} sin poder copiar.`);
}

main()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error(err);
    await sequelize.close();
    process.exit(1);
  });
