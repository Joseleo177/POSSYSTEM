const { sequelize, Sequelize } = require("../../models");
const { imageUrl } = require("../../utils/imageStorage");
const { condicionSucursal } = require("./productAccess");

// Datos para el catálogo en PDF (10-11-2026): una tienda de cosméticos que vende al mayor
// pidió su lista de productos "con este estilo", el de los catálogos de marca de cuidado
// capilar: portada, una página por línea y dos por producto (presentación con sellos y
// precio, y la ficha con descripción, ingredientes y modo de uso).
//
// El documento se arma en el navegador (helpers/catalogPdf.js) y se guarda como PDF desde el
// diálogo de impresión. Aquí solo se junta lo que hace falta en CUATRO consultas fijas, sin
// importar cuántos productos haya: ajustes de la tienda, productos, sellos y foto adicional.
//
// Qué entra:
//  - Productos vendibles y sin padre (un modelo con variantes sale una vez, no por talla) y
//    que no son adicionales de cocina.
//  - Con `solo_publicados`, solo los que están en la vitrina pública.
//  - Quien no es admin ve lo de sus sucursales, igual que en el listado de productos.
//
// Precio: el general del producto, no el de una sucursal. El precio al mayor es de la empresa
// y el detal sugerido que acompaña tiene que ser el mismo para todos los que reciben el PDF.

const AJUSTES = [
  "store_name", "store_slogan", "store_address", "store_city", "store_rif",
  "store_phone", "store_phone2", "logo_filename",
  "catalog_whatsapp", "catalog_instagram", "brand_color", "catalog_brand_color",
];

// El catálogo con fotos lleva dos páginas por producto: más de 400 sería un PDF inmanejable.
// La lista de precios es una fila por producto, y una tienda de repuestos pasa de 3.000.
const TOPE = { catalogo: 400, lista: 6000 };

function listaIds(valor) {
  const crudo = Array.isArray(valor) ? valor : String(valor || "").split(",");
  return crudo.map(n => parseInt(n, 10)).filter(Number.isInteger);
}

async function datosCatalogo({ company_id, visibles = null, category_ids, solo_publicados, formato }) {
  // "lista": lista de precios densa (repuestos, bodegas, vendedores). No lleva descripción,
  // sellos ni foto adicional, así que no se piden: con miles de filas pesarían de más.
  const esLista = formato === "lista";
  const tope = esLista ? TOPE.lista : TOPE.catalogo;
  if (!company_id) {
    const e = new Error("Elige una empresa para generar el catálogo"); e.status = 400; e.isOperational = true; throw e;
  }
  const q = (sql, replacements) => sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });

  const categorias = listaIds(category_ids);
  const filtros = [
    "p.company_id = :cid",
    "p.parent_id IS NULL",
    "p.sellable = true",
    "COALESCE(p.is_addon, false) = false",
  ];
  if (categorias.length) filtros.push("p.category_id IN (:cats)");
  if (solo_publicados === true || solo_publicados === "true") filtros.push("p.visible_in_catalog = true");
  if (visibles) filtros.push(condicionSucursal("p", visibles));

  const [ajustes, productos] = await Promise.all([
    q(`SELECT key, value FROM settings WHERE company_id = :cid AND key IN (:keys)`, { cid: company_id, keys: AJUSTES }),
    q(`
      SELECT p.id, p.name, p.brand, p.short_description, ${esLista ? "NULL AS description" : "p.description"}, p.net_content, p.visible_in_catalog,
             p.barcode, p.unit,
             p.price::float AS price, p.wholesale_price::float AS wholesale_price,
             p.image_filename, p.category_id,
             c.name AS category_name, c.color AS category_color,
             c.image_filename AS category_image, c.short_description AS category_description
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${filtros.join(" AND ")}
       ORDER BY c.name NULLS LAST, p.name
       LIMIT ${tope + 1}`,
      { cid: company_id, cats: categorias.length ? categorias : [0] }),
  ]);

  const truncado = productos.length > tope;
  if (truncado) productos.length = tope;
  const ids = productos.map(p => p.id);

  const [sellos, fotos] = ids.length && !esLista ? await Promise.all([
    q(`SELECT pbt.product_id, bt.name
         FROM product_benefit_tags pbt
         JOIN catalog_benefit_tags bt ON bt.id = pbt.benefit_tag_id
        WHERE pbt.product_id IN (:ids)
        ORDER BY bt.name`, { ids }),
    // La primera foto adicional ilustra la página de detalle; sin ella se repite la principal.
    q(`SELECT DISTINCT ON (product_id) product_id, image_filename
         FROM product_images
        WHERE product_id IN (:ids)
        ORDER BY product_id, position, id`, { ids }),
  ]) : [[], []];

  const sellosDe = new Map();
  for (const s of sellos) {
    if (!sellosDe.has(s.product_id)) sellosDe.set(s.product_id, []);
    sellosDe.get(s.product_id).push(s.name);
  }
  const fotoDe = new Map(fotos.map(f => [f.product_id, f.image_filename]));

  const lineas = new Map();
  for (const p of productos) {
    const key = p.category_id ?? 0;
    if (!lineas.has(key)) {
      lineas.set(key, {
        id: p.category_id,
        name: p.category_name || "Otros productos",
        color: p.category_color || null,
        image_url: imageUrl(p.category_image),
        description: p.category_description || null,
      });
    }
  }

  const s = Object.fromEntries(ajustes.map(a => [a.key, a.value]));
  return {
    store: {
      name: s.store_name || null,
      slogan: s.store_slogan || null,
      rif: String(s.store_rif || "").trim() || null,
      address: [s.store_address, s.store_city].filter(Boolean).join(", ") || null,
      phone: [s.store_phone, s.store_phone2].filter(Boolean).join(" / ") || null,
      whatsapp: String(s.catalog_whatsapp || "").replace(/\D/g, "") || null,
      instagram: String(s.catalog_instagram || "").trim() || null,
      logo_url: imageUrl(s.logo_filename),
      color: s.catalog_brand_color || s.brand_color || null,
    },
    lines: [...lineas.values()],
    products: productos.map(p => ({
      id: p.id,
      name: p.name,
      brand: p.brand || null,
      tagline: p.short_description || null,
      description: p.description || null,
      net_content: p.net_content || null,
      barcode: p.barcode || null,
      unit: p.unit || null,
      price: p.price,
      wholesale_price: p.wholesale_price,
      category_id: p.category_id,
      visible: !!p.visible_in_catalog,
      image_url: imageUrl(p.image_filename),
      detail_image_url: imageUrl(fotoDe.get(p.id) || null),
      benefits: sellosDe.get(p.id) || [],
    })),
    truncated: truncado,
    limit: tope,
  };
}

module.exports = { datosCatalogo };
