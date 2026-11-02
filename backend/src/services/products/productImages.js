const { Product, ProductImage, Sequelize, sequelize } = require("../../models");
const { imageUrl, saveImage, deleteImage } = require("../../utils/imageStorage");
const { runWithoutTenant } = require("../../utils/tenantStorage");

// Fotos adicionales de un producto (ver migración 20261104100000-product-images). La principal
// sigue en products.image_filename; estas solo se ven en la ficha del producto de la vitrina.
//
// Cada operación va por su cuenta, sin esperar al "Guardar cambios" de la ficha, igual que la
// foto por color de las variantes: subir seis fotos en un solo guardado pasaría el tope de
// 4,5 MB por petición de Vercel.
//
// company_id va a mano en todas las consultas: la subida pasa por multer, que rompe el
// contexto del que depende el filtro por empresa (ver controllers/catalogBanners.js).

const { Op } = Sequelize;
const MAX_FOTOS = 12;

const fallo = (status, message) => Object.assign(new Error(message), { status, isOperational: true });
const soloEmpresa = (company_id) => (company_id ? { company_id } : {});
const limpiarNombre = (v) => {
  const s = String(v ?? "").trim().slice(0, 60);
  return s || null;
};

async function productoDe(productId, company_id, transaction) {
  const p = await Product.findOne({
    where: { id: productId, ...soloEmpresa(company_id) },
    attributes: ["id", "company_id", "image_filename", "parent_id"],
    transaction,
  });
  if (!p) throw fallo(404, "Producto no encontrado");
  // Una variante (talla/color) no se publica sola: la ficha de la vitrina es la del modelo.
  if (p.parent_id) throw fallo(400, "Las fotos adicionales van en el modelo, no en cada variante");
  return p;
}

async function fotoDe(productId, imageId, company_id, transaction) {
  const f = await ProductImage.findOne({
    where: { id: imageId, product_id: productId, ...soloEmpresa(company_id) },
    transaction,
  });
  if (!f) throw fallo(404, "Foto no encontrada");
  return f;
}

const aJson = (f) => ({ id: f.id, image_url: imageUrl(f.image_filename), label: f.label, position: f.position });

async function listar(productId, company_id) {
  await productoDe(productId, company_id);
  const fotos = await ProductImage.findAll({
    where: { product_id: productId, ...soloEmpresa(company_id) },
    order: [["position", "ASC"], ["id", "ASC"]],
  });
  return { data: fotos.map(aJson) };
}

// Si el producto todavía no tiene foto principal, la primera que se sube pasa a serlo: es lo
// que el usuario espera ver en la grilla y en la caja.
async function agregar({ productId, file, label, company_id }) {
  if (!file) throw fallo(400, "Falta la imagen");
  const p = await productoDe(productId, company_id);
  const total = await ProductImage.count({ where: { product_id: p.id, ...soloEmpresa(company_id) } });
  if (total >= MAX_FOTOS) throw fallo(400, `Un producto admite hasta ${MAX_FOTOS} fotos adicionales`);

  const archivo = await saveImage(file, "product");
  if (!p.image_filename) {
    await Product.update({ image_filename: archivo }, { where: { id: p.id, ...soloEmpresa(company_id) } });
    return { data: { principal: true, image_url: imageUrl(archivo) } };
  }

  const ultima = await ProductImage.max("position", { where: { product_id: p.id, ...soloEmpresa(company_id) } });
  const foto = await ProductImage.create({
    company_id: p.company_id,
    product_id: p.id,
    image_filename: archivo,
    label: limpiarNombre(label),
    position: (Number.isInteger(ultima) ? ultima : -1) + 1,
  });
  return { data: { principal: false, image: aJson(foto) } };
}

async function renombrar({ productId, imageId, label, company_id }) {
  await productoDe(productId, company_id);
  const f = await fotoDe(productId, imageId, company_id);
  f.label = limpiarNombre(label);
  await f.save();
  return { data: aJson(f) };
}

// `ids` es el orden completo que se ve en pantalla. Los que no son de este producto se ignoran.
async function ordenar({ productId, ids, company_id }) {
  await productoDe(productId, company_id);
  const lista = (Array.isArray(ids) ? ids : []).map((v) => parseInt(v, 10)).filter(Number.isInteger);
  await sequelize.transaction(async (transaction) => {
    for (let i = 0; i < lista.length; i++) {
      await ProductImage.update(
        { position: i },
        { where: { id: lista[i], product_id: productId, ...soloEmpresa(company_id) }, transaction }
      );
    }
  });
  return listar(productId, company_id);
}

// Intercambia la foto con la principal: la elegida pasa al producto y la principal de antes
// ocupa su lugar entre las adicionales. No se copia ni se borra ningún archivo. El nombre
// ("Modelo 3") se queda en su casilla, porque la principal no lleva nombre.
async function hacerPrincipal({ productId, imageId, company_id }) {
  return sequelize.transaction(async (transaction) => {
    const p = await productoDe(productId, company_id, transaction);
    const f = await fotoDe(productId, imageId, company_id, transaction);
    const nueva = f.image_filename;
    const anterior = p.image_filename;
    await Product.update({ image_filename: nueva }, { where: { id: p.id, ...soloEmpresa(company_id) }, transaction });
    if (anterior) {
      f.image_filename = anterior;
      f.label = null;
      await f.save({ transaction });
    } else {
      await f.destroy({ transaction });
    }
    return { data: { image_url: imageUrl(nueva) } };
  });
}

// El archivo solo se borra si nadie más apunta a él. Los productos heredados por código de
// barras de versiones viejas compartían la URL entre empresas, y ante la duda el archivo se
// queda (mismo criterio que handleImageDelete en productService).
async function borrarArchivoSiSobra(valor) {
  if (!valor) return;
  let usos = 1;
  try {
    usos = await runWithoutTenant(async () =>
      (await Product.count({ where: { image_filename: valor } })) +
      (await ProductImage.count({ where: { image_filename: valor } }))
    );
  } catch (err) {
    console.warn(`[productImages] no se pudo comprobar quién usa ${valor}; el archivo se conserva: ${err.message}`);
    return;
  }
  if (usos === 0) await deleteImage(valor);
}

async function eliminar({ productId, imageId, company_id }) {
  await productoDe(productId, company_id);
  const f = await fotoDe(productId, imageId, company_id);
  const valor = f.image_filename;
  await f.destroy();
  await borrarArchivoSiSobra(valor);
  return { data: { id: f.id } };
}

// Para deleteProduct: la fila se va sola con la llave foránea (ON DELETE CASCADE), pero los
// archivos no. Se leen antes de borrar el producto y se limpian después.
async function archivosDe(productId) {
  const fotos = await ProductImage.findAll({ where: { product_id: productId }, attributes: ["image_filename"] });
  return fotos.map((f) => f.image_filename);
}
async function borrarArchivos(valores) {
  for (const v of valores) await borrarArchivoSiSobra(v);
}

// Las fotos adicionales de la ficha pública: solo la URL y el nombre, en su orden.
async function paraVitrina(productId) {
  const fotos = await ProductImage.findAll({
    where: { product_id: productId },
    attributes: ["image_filename", "label"],
    order: [["position", "ASC"], ["id", "ASC"]],
  });
  return fotos.map((f) => ({ url: imageUrl(f.image_filename), label: f.label || null }));
}

// La grilla de la vitrina: las tarjetas pasan sus fotos al poner el cursor encima. Una sola
// consulta para toda la página y como mucho POR_TARJETA por producto, solo la URL: el nombre y
// el resto quedan para la ficha.
const POR_TARJETA = 4;
async function paraGrilla(productIds) {
  const mapa = new Map();
  if (!productIds.length) return mapa;
  const fotos = await ProductImage.findAll({
    where: { product_id: { [Op.in]: productIds } },
    attributes: ["product_id", "image_filename"],
    order: [["product_id", "ASC"], ["position", "ASC"], ["id", "ASC"]],
    raw: true,
  });
  for (const f of fotos) {
    const lista = mapa.get(f.product_id) || [];
    if (lista.length < POR_TARJETA) lista.push(imageUrl(f.image_filename));
    mapa.set(f.product_id, lista);
  }
  return mapa;
}

module.exports = {
  MAX_FOTOS, listar, agregar, renombrar, ordenar, hacerPrincipal, eliminar,
  archivosDe, borrarArchivos, paraVitrina, paraGrilla,
};
