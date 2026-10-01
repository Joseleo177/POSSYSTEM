const {
  Product, ProductStock, ProductAttribute, ProductAttributeValue, ProductVariantValue,
  SaleItem, PurchaseItem, StockTransfer, StockTransferItem, ProductComboItem,
  StockSessionLine, ReturnItem, QuotationItem, Sequelize, sequelize,
} = require("../../models");
const { Op } = Sequelize;

// Variantes de producto (talla, color). La variante es un producto más con parent_id hacia su
// modelo; ver la migración 20261001120000-product-variants para el porqué.
//
// Ojo con el tenant: syncVariants corre dentro del guardado del producto, que pasa por multer,
// y ahí el filtro automático por empresa se pierde. Todo lo que busca filas de la empresa lleva
// company_id a mano.

const bad = (msg, status = 400) => { const e = new Error(msg); e.status = status; e.isOperational = true; throw e; };
const conEmpresa = (company_id) => (company_id ? { company_id } : {});
const fotoUrl = (f) => (f ? (f.startsWith("http") ? f : `/uploads/${f}`) : null);
const limpiar = (s, max = 40) => String(s ?? "").trim().replace(/\s+/g, " ").slice(0, max);

// ── Atributos y valores ─────────────────────────────────────────────────────────────

async function listAttributes(company_id) {
  const attrs = await ProductAttribute.findAll({
    where: conEmpresa(company_id),
    include: [{ model: ProductAttributeValue, as: "values", attributes: ["id", "value", "position"] }],
    order: [["position", "ASC"], ["name", "ASC"], [{ model: ProductAttributeValue, as: "values" }, "position", "ASC"], [{ model: ProductAttributeValue, as: "values" }, "id", "ASC"]],
  });
  return { data: attrs };
}

// "M" y "m" son la misma talla: se compara sin mayúsculas para no duplicarla.
async function findValue(attribute_id, value, transaction) {
  return ProductAttributeValue.findOne({
    where: { attribute_id, [Op.and]: [sequelize.where(sequelize.fn("lower", sequelize.col("value")), value.toLowerCase())] },
    transaction,
  });
}

async function addValuesTo(attr, values, company_id, transaction) {
  const max = (await ProductAttributeValue.max("position", { where: { attribute_id: attr.id }, transaction })) ?? -1;
  let pos = max + 1;
  for (const raw of values || []) {
    const value = limpiar(raw);
    if (!value) continue;
    if (await findValue(attr.id, value, transaction)) continue;
    await ProductAttributeValue.create({ attribute_id: attr.id, value, position: pos++, company_id }, { transaction });
  }
}

async function createAttribute({ name, values }, company_id) {
  const nombre = limpiar(name);
  if (!nombre) bad("El nombre es requerido");
  const existe = await ProductAttribute.findOne({
    where: { ...conEmpresa(company_id), [Op.and]: [sequelize.where(sequelize.fn("lower", sequelize.col("name")), nombre.toLowerCase())] },
  });
  if (existe) bad(`Ya existe el atributo "${existe.name}"`, 409);

  const t = await sequelize.transaction();
  try {
    const max = (await ProductAttribute.max("position", { where: conEmpresa(company_id), transaction: t })) ?? -1;
    const attr = await ProductAttribute.create({ name: nombre, position: max + 1, company_id }, { transaction: t });
    await addValuesTo(attr, values, company_id, t);
    await t.commit();
  } catch (err) { await t.rollback(); throw err; }
  return listAttributes(company_id);
}

async function getAttribute(id, company_id) {
  const attr = await ProductAttribute.findOne({ where: { id, ...conEmpresa(company_id) } });
  if (!attr) bad("Atributo no encontrado", 404);
  return attr;
}

async function addValues(id, values, company_id) {
  const attr = await getAttribute(id, company_id);
  const t = await sequelize.transaction();
  try {
    await addValuesTo(attr, Array.isArray(values) ? values : [values], company_id, t);
    await t.commit();
  } catch (err) { await t.rollback(); throw err; }
  return listAttributes(company_id);
}

async function renameAttribute(id, name, company_id) {
  const attr = await getAttribute(id, company_id);
  const nombre = limpiar(name);
  if (!nombre) bad("El nombre es requerido");
  await attr.update({ name: nombre });
  return listAttributes(company_id);
}

// Renombrar un valor cambia el nombre de las variantes que lo llevan: el nombre completo
// ("Franela Básica Negro / L") vive en products.name para que tickets y kardex no lo armen.
async function renameValue(id, valueId, value, company_id) {
  await getAttribute(id, company_id);
  const nuevo = limpiar(value);
  if (!nuevo) bad("El valor es requerido");
  const val = await ProductAttributeValue.findOne({ where: { id: valueId, attribute_id: id } });
  if (!val) bad("Valor no encontrado", 404);
  const otro = await findValue(id, nuevo);
  if (otro && otro.id !== val.id) bad(`Ya existe "${otro.value}"`, 409);

  const t = await sequelize.transaction();
  try {
    await val.update({ value: nuevo }, { transaction: t });
    const usos = await ProductVariantValue.findAll({ where: { attribute_value_id: val.id }, attributes: ["product_id"], transaction: t });
    const variantes = await Product.findAll({ where: { id: { [Op.in]: usos.map(u => u.product_id) } }, attributes: ["parent_id"], transaction: t });
    const modelos = await Product.findAll({ where: { id: { [Op.in]: [...new Set(variantes.map(v => v.parent_id))] } }, transaction: t });
    for (const m of modelos) await propagateModelToVariants(m, t);
    await t.commit();
  } catch (err) { await t.rollback(); throw err; }
  return listAttributes(company_id);
}

// El orden se da con la lista completa de ids, tal como queda en pantalla.
async function reorderValues(id, ids, company_id) {
  await getAttribute(id, company_id);
  const t = await sequelize.transaction();
  try {
    for (let i = 0; i < (ids || []).length; i++) {
      await ProductAttributeValue.update({ position: i }, { where: { id: ids[i], attribute_id: id }, transaction: t });
    }
    await t.commit();
  } catch (err) { await t.rollback(); throw err; }
  return listAttributes(company_id);
}

async function removeAttribute(id, company_id) {
  const attr = await getAttribute(id, company_id);
  const usos = await ProductVariantValue.count({ where: { attribute_id: attr.id } });
  if (usos > 0) bad(`"${attr.name}" lo usan ${usos} variante(s): quítalo de esos productos primero`);
  await attr.destroy();
  return listAttributes(company_id);
}

async function removeValue(id, valueId, company_id) {
  await getAttribute(id, company_id);
  const val = await ProductAttributeValue.findOne({ where: { id: valueId, attribute_id: id } });
  if (!val) bad("Valor no encontrado", 404);
  const usos = await ProductVariantValue.count({ where: { attribute_value_id: val.id } });
  if (usos > 0) bad(`"${val.value}" lo usan ${usos} variante(s): quítalas primero`);
  await val.destroy();
  return listAttributes(company_id);
}

// ── Variantes de un modelo ──────────────────────────────────────────────────────────

// Etiquetas de cada variante en el orden de los atributos del modelo: "Negro / L".
async function valoresDe(variantIds, transaction) {
  if (!variantIds.length) return {};
  const rows = await ProductVariantValue.findAll({
    where: { product_id: { [Op.in]: variantIds } },
    include: [
      { model: ProductAttribute, as: "attribute", attributes: ["id", "name", "position"] },
      { model: ProductAttributeValue, as: "value", attributes: ["id", "value", "position"] },
    ],
    transaction,
  });
  const map = {};
  for (const r of rows) (map[r.product_id] ||= []).push(r);
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => (a.attribute.position - b.attribute.position) || (a.attribute.id - b.attribute.id));
  }
  return map;
}

const nombreVariante = (modelo, etiquetas) => `${modelo.name} ${etiquetas.join(" / ")}`.slice(0, 200);

// Lo que la variante hereda del modelo y se mantiene al día cuando el modelo cambia.
function heredado(modelo) {
  return {
    category_id: modelo.category_id,
    unit: modelo.unit,
    qty_step: modelo.qty_step,
    sellable: modelo.sellable,
    package_unit: modelo.package_unit,
    package_size: modelo.package_size,
    min_stock: modelo.min_stock,
  };
}

async function propagateModelToVariants(modelo, transaction) {
  const variantes = await Product.findAll({ where: { parent_id: modelo.id, company_id: modelo.company_id }, transaction });
  if (!variantes.length) return;
  const vals = await valoresDe(variantes.map(v => v.id), transaction);
  for (const v of variantes) {
    const etiquetas = (vals[v.id] || []).map(r => r.value.value);
    await v.update({
      ...heredado(modelo),
      name: nombreVariante(modelo, etiquetas),
      ...(v.own_price ? {} : { price: modelo.price }),
    }, { transaction });
  }
}

// ¿Tiene la variante algo que la ate? Existencias o cualquier documento: borrarla dejaría
// ventas, compras o kardex apuntando a un producto que ya no existe.
async function motivoParaNoBorrar(id, transaction) {
  const q = { where: { product_id: id }, transaction };
  if (parseFloat((await ProductStock.sum("qty", q)) || 0) !== 0) return "tiene existencias";
  if (await SaleItem.count(q)) return "tiene ventas";
  if (await PurchaseItem.count(q)) return "tiene compras";
  if (await ReturnItem.count(q)) return "tiene devoluciones";
  if (await QuotationItem.count(q)) return "está en cotizaciones";
  if (await StockTransfer.count(q)) return "tiene transferencias";
  if (StockTransferItem && await StockTransferItem.count(q)) return "tiene transferencias";
  if (await StockSessionLine.count(q)) return "tiene ajustes de inventario";
  if (await ProductComboItem.count(q)) return "es parte de un combo";
  return null;
}

async function getVariants(modelId, { warehouse_id, company_id } = {}) {
  const modelo = await Product.findOne({ where: { id: modelId, ...conEmpresa(company_id) } });
  if (!modelo) bad("Producto no encontrado", 404);

  const wid = parseInt(warehouse_id, 10) || null;
  const variantes = await Product.findAll({
    where: { parent_id: modelo.id, ...conEmpresa(company_id) },
    include: wid ? [{ model: ProductStock, as: "stocks", where: { warehouse_id: wid }, required: false, attributes: ["qty", "price"] }] : [],
    order: [["id", "ASC"]],
  });
  const vals = await valoresDe(variantes.map(v => v.id));

  // Solo los atributos y valores que el modelo usa, en su orden: es lo que arma la grilla.
  const attrs = new Map();
  const data = variantes.map(v => {
    const filas = vals[v.id] || [];
    const value_ids = {};
    for (const r of filas) {
      value_ids[r.attribute.id] = r.value.id;
      if (!attrs.has(r.attribute.id)) attrs.set(r.attribute.id, { id: r.attribute.id, name: r.attribute.name, position: r.attribute.position, values: new Map() });
      attrs.get(r.attribute.id).values.set(r.value.id, { id: r.value.id, value: r.value.value, position: r.value.position });
    }
    const ficha = v.stocks?.[0];
    return {
      id: v.id,
      name: v.name,
      label: filas.map(r => r.value.value).join(" / "),
      value_ids,
      barcode: v.barcode,
      // Solo la foto propia: la del modelo se aplica al mostrar, y el editor necesita saber
      // qué color ya tiene la suya.
      image_url: fotoUrl(v.image_filename),
      price: parseFloat(ficha?.price ?? v.price),
      own_price: v.own_price,
      cost_price: v.cost_price != null ? parseFloat(v.cost_price) : null,
      // Sin almacén: el total de la empresa. Con almacén: lo de esa sucursal, y `in_warehouse`
      // dice si la variante tiene ficha ahí (sin ficha no se vende en esa tienda).
      qty: wid ? parseFloat(ficha?.qty ?? 0) : parseFloat(v.stock ?? 0),
      in_warehouse: wid ? !!ficha : null,
    };
  });

  const attributes = [...attrs.values()]
    .sort((a, b) => (a.position - b.position) || (a.id - b.id))
    .map(a => ({ id: a.id, name: a.name, values: [...a.values.values()].sort((x, y) => (x.position - y.position) || (x.id - y.id)) }));

  return { data: { model: {
    id: modelo.id, name: modelo.name, price: parseFloat(modelo.price), image_url: fotoUrl(modelo.image_filename),
    unit: modelo.unit, sellable: modelo.sellable,
    profit_margin: modelo.profit_margin != null ? parseFloat(modelo.profit_margin) : null,
  }, attributes, variants: data } };
}

// Guarda la lista completa de variantes de un modelo, tal como quedó en la ficha.
//
// `payload` = { attribute_ids: [orden de los atributos], variants: [{ id?, value_ids: {attrId: valueId}, barcode, price, own_price }] }
// Las que ya existían y no vienen se borran, salvo que tengan historia: entonces se avisa
// cuál y por qué, y no se guarda nada.
async function syncVariants(modelo, payload, { company_id, warehouse_id }, transaction) {
  const attributeIds = (payload?.attribute_ids || []).map(n => parseInt(n, 10)).filter(Number.isInteger);
  const entrantes = Array.isArray(payload?.variants) ? payload.variants : [];
  if (!attributeIds.length) bad("Elige al menos un atributo (talla, color...)");
  if (!entrantes.length) bad("Agrega al menos una variante");

  const attrs = await ProductAttribute.findAll({ where: { id: { [Op.in]: attributeIds }, ...conEmpresa(company_id) }, transaction });
  if (attrs.length !== attributeIds.length) bad("Hay un atributo que no existe");
  const orden = attributeIds.map(id => attrs.find(a => a.id === id));

  const valores = await ProductAttributeValue.findAll({ where: { attribute_id: { [Op.in]: attributeIds } }, transaction });
  const valorPorId = new Map(valores.map(v => [v.id, v]));

  const existentes = await Product.findAll({ where: { parent_id: modelo.id, ...conEmpresa(company_id) }, transaction });
  const existentePorId = new Map(existentes.map(v => [v.id, v]));

  // Validar todo antes de escribir nada.
  const claves = new Set();
  const barcodes = new Set();
  const plan = [];
  for (const e of entrantes) {
    const vids = {};
    const etiquetas = [];
    for (const attr of orden) {
      const vid = parseInt(e.value_ids?.[attr.id] ?? e.value_ids?.[String(attr.id)], 10);
      const val = valorPorId.get(vid);
      if (!val || val.attribute_id !== attr.id) bad(`A una variante le falta ${attr.name.toLowerCase()}`);
      vids[attr.id] = vid;
      etiquetas.push(val.value);
    }
    const etiqueta = etiquetas.join(" / ");
    const key = Object.values(vids).sort((a, b) => a - b).join("-");
    if (claves.has(key)) bad(`"${etiqueta}" está repetida`);
    claves.add(key);

    const barcode = limpiar(e.barcode, 50) || null;
    if (barcode) {
      if (barcodes.has(barcode)) bad(`El código ${barcode} está en dos variantes`);
      barcodes.add(barcode);
    }

    const id = e.id ? parseInt(e.id, 10) : null;
    if (id && !existentePorId.has(id)) bad("Una de las variantes no pertenece a este producto");

    const ownPrice = e.own_price === true || e.own_price === "true";
    const precio = parseFloat(e.price);
    if (ownPrice && !(precio > 0)) bad(`"${etiqueta}": el precio propio debe ser mayor a 0`);

    plan.push({ id, vids, key, etiquetas, etiqueta, barcode, ownPrice, precio });
  }

  if (barcodes.size) {
    const ocupados = await Product.findAll({
      where: { barcode: { [Op.in]: [...barcodes] }, ...conEmpresa(company_id) },
      attributes: ["id", "name", "barcode"], transaction,
    });
    // Un código que ya tiene otra variante de este mismo modelo no es conflicto: se liberan
    // todos antes de reasignarlos (ver abajo), así que pueden cambiar de manos.
    const ajeno = ocupados.find(o => !existentePorId.has(o.id));
    if (ajeno) bad(`El código ${ajeno.barcode} ya lo tiene "${ajeno.name}"`);
  }

  const quedan = new Set(plan.filter(p => p.id).map(p => p.id));
  const salen = existentes.filter(v => !quedan.has(v.id));
  for (const v of salen) {
    const motivo = await motivoParaNoBorrar(v.id, transaction);
    if (motivo) bad(`No se puede quitar "${v.name}": ${motivo}`);
  }

  // Escribir. Primero se liberan las claves y códigos de las que salen, y las que cambian de
  // valores se dejan sin clave un momento: sin esto, intercambiar dos (Negro/L ↔ Blanco/L)
  // chocaría contra el índice único a mitad de camino.
  for (const v of salen) {
    await ProductStock.destroy({ where: { product_id: v.id }, transaction });
    await v.destroy({ transaction });
  }
  for (const p of plan.filter(p => p.id)) {
    await existentePorId.get(p.id).update({ variant_key: null, barcode: null }, { transaction });
  }

  const wid = parseInt(warehouse_id, 10) || null;
  for (const p of plan) {
    const datos = {
      ...heredado(modelo),
      name: nombreVariante(modelo, p.etiquetas),
      parent_id: modelo.id,
      variant_key: p.key,
      barcode: p.barcode,
      own_price: p.ownPrice,
      price: p.ownPrice ? p.precio : modelo.price,
    };
    let variante;
    if (p.id) {
      variante = existentePorId.get(p.id);
      await variante.update(datos, { transaction });
      await ProductVariantValue.destroy({ where: { product_id: variante.id }, transaction });
    } else {
      variante = await Product.create({
        ...datos, stock: 0, is_combo: false, is_service: false, visible_in_catalog: false, company_id,
      }, { transaction });
      // Nace con ficha en la sucursal desde la que se creó, como cualquier producto: así ya
      // aparece en su inventario y en su caja, en cero hasta que entre mercancía.
      if (wid) {
        await ProductStock.findOrCreate({
          where: { product_id: variante.id, warehouse_id: wid },
          defaults: { qty: 0, company_id },
          transaction,
        });
      }
    }
    await ProductVariantValue.bulkCreate(
      Object.entries(p.vids).map(([attribute_id, attribute_value_id]) => ({ product_id: variante.id, attribute_id: parseInt(attribute_id, 10), attribute_value_id })),
      { transaction },
    );
  }
}

// Al volverse modelo, el producto deja de ser algo que se vende o se cuenta. Solo se permite
// si nunca se movió: sus existencias y su historia no tendrían a qué variante pertenecer.
async function assertCanBecomeModel(product, transaction) {
  if (product.parent_id) bad("Una variante no puede tener variantes propias");
  if (product.is_combo || product.is_service) bad("Un combo o un servicio no lleva variantes");
  const motivo = await motivoParaNoBorrar(product.id, transaction);
  if (motivo) bad(`Este producto ya ${motivo}: crea un producto nuevo para manejarlo por variantes`);
  // Las fichas en cero que tuviera se van: un modelo no tiene inventario y, con ficha, se
  // colaría en la caja y en el conteo de esa sucursal.
  await ProductStock.destroy({ where: { product_id: product.id }, transaction });
}

module.exports = {
  listAttributes, createAttribute, addValues, renameAttribute, renameValue, reorderValues,
  removeAttribute, removeValue, getVariants, syncVariants, propagateModelToVariants,
  assertCanBecomeModel,
};
