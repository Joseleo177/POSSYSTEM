const { Product, ProductComboItem, ProductStock, RecipeSheet, Setting, sequelize, Sequelize } = require("../models");
const { isIntegerUnit } = require("../utils/units");
const { assertWarehouseAccess } = require("../middleware/auth");
const { marcarRecetaDesde } = require("./products/recipeStock");

// App Recetas (restaurante): la ficha técnica de cada plato.
//
// La receta de un plato son sus product_combo_items, los mismos que la caja ya descuenta al
// vender. Aquí se escriben como en la cocina: lo que va al plato (250 g de lomo limpio) y la
// merma del insumo (20 %). Lo que se descuenta es el bruto (313 g), que es lo que cuesta.
// Un plato que era servicio pasa a combo al guardarle receta; ver products/recipeStock.js
// para lo que eso cambia al vender, anular y devolver.

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const int = (v) => (Number.isInteger(Number(v)) ? Number(v) : NaN);
const round3 = (n) => Math.round(n * 1000) / 1000;
const round4 = (n) => Math.round(n * 10000) / 10000;

const META_KEY = "recetas_food_cost_meta";
const META_DEFAULT = 35;
const MAX_LINEAS = 40;
const UNIDADES_INSUMO = ["KG", "LITRO", "UNIDAD"];

const companyOf = (req) => {
  const c = req.company_id ?? req.employee?.company_id ?? null;
  if (!c) throw fail("Elige una empresa para trabajar en Recetas");
  return parseInt(c, 10);
};

async function metaDe(companyId) {
  const s = await Setting.findOne({ where: { key: META_KEY, company_id: companyId }, attributes: ["value"] });
  const n = parseFloat(s?.value);
  return n > 0 && n < 100 ? n : META_DEFAULT;
}

// La sucursal en la que se miran precio y costo. Sin ella, los del catálogo.
async function sucursalDe(req, raw) {
  const wid = parseInt(raw, 10);
  if (!Number.isInteger(wid) || wid <= 0) return null;
  await assertWarehouseAccess(req, wid);
  return wid;
}

// Un plato con receta o que puede tenerla: se vende, no es adicional (esos se arman en
// Catálogo → Adicionales) ni modelo de variantes, y no lleva existencia propia.
const ES_PLATO = `p.sellable = true AND p.is_addon = false AND p.is_variant_parent = false
  AND p.piece_mode IS NULL AND (p.is_service = true OR p.is_combo = true)`;

// Costo por unidad del insumo en la sucursal: el de su ficha y si no, el del catálogo. Es la
// misma regla con que la venta congela el costo de un combo (createSale).
const COSTO_INSUMO = `COALESCE(ips.cost_price, i.cost_price, 0)`;

/** Los platos de la empresa, con su costo de receta y food cost en la sucursal. */
async function list(req, query = {}) {
  const cid = companyOf(req);
  const wid = await sucursalDe(req, query.warehouse_id);
  const filas = await sequelize.query(`
    SELECT p.id, p.name, p.image_filename, p.is_combo, p.is_service,
           c.name AS category_name,
           COALESCE(ps.price, p.price) AS price,
           rs.updated_at AS sheet_updated_at, rs.prep_minutes,
           r.lines, r.cost, r.sin_costo
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = CAST(:wid AS int)
      LEFT JOIN recipe_sheets rs ON rs.product_id = p.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS lines,
               SUM(ci.quantity * ${COSTO_INSUMO}) AS cost,
               COUNT(*) FILTER (WHERE ${COSTO_INSUMO} = 0)::int AS sin_costo
          FROM product_combo_items ci
          JOIN products i ON i.id = ci.product_id
          LEFT JOIN product_stock ips ON ips.product_id = i.id AND ips.warehouse_id = CAST(:wid AS int)
         WHERE ci.combo_id = p.id
      ) r ON p.is_combo
     WHERE p.company_id = :cid AND ${ES_PLATO}
     ORDER BY c.name NULLS LAST, p.name`,
    { replacements: { cid, wid }, type: Sequelize.QueryTypes.SELECT });

  return {
    meta: { food_cost_target: await metaDe(cid) },
    data: filas.map(f => {
      const price = parseFloat(f.price) || 0;
      const conReceta = f.is_combo && f.lines > 0;
      const cost = conReceta ? round4(parseFloat(f.cost) || 0) : null;
      return {
        product_id: f.id,
        name: f.name,
        category_name: f.category_name,
        image_url: f.image_filename ? (f.image_filename.startsWith("http") ? f.image_filename : `/uploads/${f.image_filename}`) : null,
        price,
        has_recipe: conReceta,
        lines: conReceta ? f.lines : 0,
        missing_costs: conReceta ? f.sin_costo : 0,
        cost,
        food_cost_pct: conReceta && price > 0 ? Math.round((cost / price) * 1000) / 10 : null,
        margin: conReceta ? round4(price - cost) : null,
        prep_minutes: f.prep_minutes,
        updated_at: f.sheet_updated_at,
      };
    }),
  };
}

/** Insumos para la receta: productos con existencia propia, con su costo en la sucursal. */
async function ingredients(req, query = {}) {
  const cid = companyOf(req);
  const wid = await sucursalDe(req, query.warehouse_id);
  const q = String(query.search || "").trim().slice(0, 80);
  if (!q) return { data: [] };
  const filas = await sequelize.query(`
    SELECT i.id, i.name, i.unit, i.sellable, ${COSTO_INSUMO} AS cost, ips.qty,
           EXISTS (SELECT 1 FROM recipe_sheets rs WHERE rs.product_id = i.id AND rs.kind = 'preparacion') AS is_preparation
      FROM products i
      LEFT JOIN product_stock ips ON ips.product_id = i.id AND ips.warehouse_id = CAST(:wid AS int)
     WHERE i.company_id = :cid
       AND i.is_combo = false AND i.is_service = false AND i.is_addon = false
       AND i.is_variant_parent = false AND i.piece_mode IS NULL
       AND i.name ILIKE :q
     ORDER BY i.sellable ASC, i.name
     LIMIT 20`,
    { replacements: { cid, wid, q: `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` }, type: Sequelize.QueryTypes.SELECT });
  return {
    data: filas.map(f => ({
      id: f.id, name: f.name, unit: f.unit, sellable: f.sellable, is_preparation: f.is_preparation,
      cost: round4(parseFloat(f.cost) || 0),
      stock: f.qty == null ? null : parseFloat(f.qty),
    })),
  };
}

/**
 * Un insumo nuevo desde la receta, para no salir a Catálogo a mitad de la ficha: no se vende
 * (sellable = false) y entra por Compras como cualquier producto. El costo es por kilo, litro
 * o unidad.
 */
async function createIngredient(req, body = {}) {
  const cid = companyOf(req);
  const name = String(body.name || "").replace(/\s+/g, " ").trim();
  if (name.length < 2) throw fail("Escribe el nombre del insumo");
  if (name.length > 200) throw fail("El nombre es demasiado largo");
  const unit = String(body.unit || "").toUpperCase();
  if (!UNIDADES_INSUMO.includes(unit)) throw fail("Elige si el insumo va por kilo, litro o unidad");
  const cost = body.cost === "" || body.cost == null ? 0 : parseFloat(body.cost);
  if (!Number.isFinite(cost) || cost < 0 || cost > 1e8) throw fail("Costo no válido");

  const repetido = await Product.findOne({
    where: { company_id: cid, name: { [Sequelize.Op.iLike]: name.replace(/[\\%_]/g, (m) => `\\${m}`) } },
    attributes: ["id", "name", "is_combo", "is_service"],
  });
  if (repetido) throw fail(`Ya existe "${repetido.name}". Búscalo en la lista`, 409);

  const p = await Product.create({
    name, unit, price: 0, cost_price: round4(cost), sellable: false, qty_step: 1, company_id: cid,
  });
  return { data: { id: p.id, name: p.name, unit: p.unit, sellable: false, cost: round4(cost), stock: null } };
}

async function platoDe(cid, productId, transaction, lock = false) {
  const id = int(productId);
  if (!Number.isInteger(id)) throw fail("Plato no válido");
  const p = await Product.findOne({ where: { id, company_id: cid }, transaction, ...(lock ? { lock: true } : {}) });
  if (!p) throw fail("El plato ya no existe", 404);
  if (!p.sellable || p.is_addon || p.is_variant_parent || p.piece_mode || !(p.is_service || p.is_combo)) {
    throw fail(`"${p.name}" no es un plato: la receta va en los servicios y combos que se venden`);
  }
  return p;
}

/** La ficha de un plato, con el costo de cada línea en la sucursal. */
async function getOne(req, productId, query = {}) {
  const cid = companyOf(req);
  const wid = await sucursalDe(req, query.warehouse_id);
  const p = await platoDe(cid, productId);
  const ficha = await RecipeSheet.findOne({ where: { product_id: p.id } });
  const precio = wid ? await ProductStock.findOne({ where: { warehouse_id: wid, product_id: p.id }, attributes: ["price"] }) : null;
  const lineas = p.is_combo ? await sequelize.query(`
    SELECT ci.product_id, ci.quantity, ci.net_quantity, ci.waste_pct,
           i.name, i.unit, i.sellable, ${COSTO_INSUMO} AS cost, ips.qty
      FROM product_combo_items ci
      JOIN products i ON i.id = ci.product_id
      LEFT JOIN product_stock ips ON ips.product_id = i.id AND ips.warehouse_id = CAST(:wid AS int)
     WHERE ci.combo_id = :pid
     ORDER BY ci.id`,
    { replacements: { pid: p.id, wid }, type: Sequelize.QueryTypes.SELECT }) : [];

  return {
    meta: { food_cost_target: await metaDe(cid) },
    data: {
      product_id: p.id,
      name: p.name,
      is_combo: p.is_combo,
      price: parseFloat(precio?.price ?? p.price) || 0,
      instructions: ficha?.instructions || "",
      prep_minutes: ficha?.prep_minutes ?? null,
      // Se puede quitar la receta solo si nació aquí (o pasó a combo con la marca): un combo
      // de antes que vuelve a servicio dejaría sin reponer sus ventas viejas al anularlas.
      removable: !!(p.is_combo && ficha?.combo_since),
      updated_at: ficha?.updated_at || null,
      lines: lineas.map(l => {
        const qty = parseFloat(l.quantity);
        const waste = parseFloat(l.waste_pct) || 0;
        return {
          product_id: l.product_id,
          name: l.name,
          unit: l.unit,
          sellable: l.sellable,
          quantity: qty,
          net_quantity: l.net_quantity != null ? parseFloat(l.net_quantity) : qty,
          waste_pct: waste,
          unit_cost: round4(parseFloat(l.cost) || 0),
          stock: l.qty == null ? null : parseFloat(l.qty),
        };
      }),
    },
  };
}

// Lo que se descuenta por plato: el neto más la merma. Lo contable no lleva merma (no se
// compra medio huevo para que rinda uno) y va entero.
function leerLineas(raw, platoId) {
  if (!Array.isArray(raw) || !raw.length) throw fail("Agrega al menos un ingrediente");
  if (raw.length > MAX_LINEAS) throw fail(`Hasta ${MAX_LINEAS} ingredientes por receta`);
  const filas = raw.map(l => ({
    product_id: int(l.product_id),
    net: round3(parseFloat(String(l.net_quantity ?? "").replace(",", ".")) || 0),
    waste: Math.round((parseFloat(String(l.waste_pct ?? 0).replace(",", ".")) || 0) * 100) / 100,
  }));
  if (filas.some(f => !Number.isInteger(f.product_id))) throw fail("Ingrediente no válido");
  if (new Set(filas.map(f => f.product_id)).size !== filas.length) throw fail("Un ingrediente está repetido: súmalo en una sola línea");
  if (filas.some(f => f.product_id === platoId)) throw fail("El plato no puede llevarse a sí mismo");
  return filas;
}

/**
 * Las líneas validadas, listas para guardar: { product_id, quantity (bruto), net_quantity,
 * waste_pct }. La comparten las recetas de platos y las de preparaciones (production.js).
 * `max`: tope del neto por línea (una olla lleva más que un plato).
 */
async function armarLineas(cid, raw, selfId, transaction, { max = 9999 } = {}) {
  const filas = leerLineas(raw, selfId);
  const insumos = await Product.findAll({
    where: { id: { [Sequelize.Op.in]: filas.map(f => f.product_id) }, company_id: cid },
    attributes: ["id", "name", "unit", "is_combo", "is_service", "is_addon", "is_variant_parent", "piece_mode"],
    transaction,
  });
  const porId = new Map(insumos.map(i => [i.id, i]));
  return filas.map(f => {
    const i = porId.get(f.product_id);
    if (!i) throw fail("Uno de los ingredientes ya no existe");
    if (i.is_combo || i.is_service || i.is_addon || i.is_variant_parent || i.piece_mode) {
      throw fail(`"${i.name}" no lleva existencia propia; elige el insumo que se gasta`);
    }
    if (!(f.net > 0) || f.net > max) throw fail(`Cantidad no válida de "${i.name}"`);
    const entero = isIntegerUnit(i.unit);
    if (entero && !Number.isInteger(f.net)) throw fail(`"${i.name}" se cuenta por unidades enteras`);
    if (entero && f.waste) throw fail(`"${i.name}" se cuenta por unidades: no lleva merma`);
    if (f.waste < 0 || f.waste >= 95) throw fail(`La merma de "${i.name}" tiene que estar entre 0 y 95 %`);
    const bruto = entero ? f.net : round3(f.net / (1 - f.waste / 100));
    if (!(bruto >= 0.001)) throw fail(`Cantidad no válida de "${i.name}"`);
    return { product_id: i.id, quantity: bruto, net_quantity: f.net, waste_pct: f.waste };
  });
}

/** Guarda la receta y la ficha. Un plato que era servicio empieza a descontarla desde ya. */
async function save(req, productId, body = {}) {
  const cid = companyOf(req);
  const instructions = String(body.instructions ?? "").trim().slice(0, 4000) || null;
  const prep = body.prep_minutes === "" || body.prep_minutes == null ? null : int(body.prep_minutes);
  if (prep !== null && !(Number.isInteger(prep) && prep >= 0 && prep <= 1440)) throw fail("Minutos de preparación no válidos");

  await sequelize.transaction(async (transaction) => {
    const p = await platoDe(cid, productId, transaction, true);
    const nuevas = (await armarLineas(cid, body.lines, p.id, transaction))
      .map(l => ({ ...l, combo_id: p.id, company_id: cid }));

    if (!p.is_combo) {
      await p.update({ is_combo: true, is_service: false, updated_at: new Date() }, { transaction });
      await marcarRecetaDesde(p.id, cid, transaction);
    }
    await ProductComboItem.destroy({ where: { combo_id: p.id }, transaction });
    await ProductComboItem.bulkCreate(nuevas, { transaction });

    const ficha = await RecipeSheet.findOne({ where: { product_id: p.id }, transaction });
    const datos = { instructions, prep_minutes: prep, updated_by: req.employee?.id ?? null };
    if (ficha) await ficha.update(datos, { transaction });
    else await RecipeSheet.create({ ...datos, product_id: p.id, company_id: cid }, { transaction });
  });

  return getOne(req, productId, { warehouse_id: body.warehouse_id });
}

/**
 * Quita la receta: el plato vuelve a ser servicio y deja de descontar. Lo ya vendido conserva
 * su foto, así que anularlo repone lo que salió. Solo para recetas con marca de inicio (ver
 * `removable` en getOne).
 */
async function remove(req, productId) {
  const cid = companyOf(req);
  await sequelize.transaction(async (transaction) => {
    const p = await platoDe(cid, productId, transaction, true);
    if (!p.is_combo) throw fail("Este plato no tiene receta");
    const ficha = await RecipeSheet.findOne({ where: { product_id: p.id }, transaction });
    if (!ficha?.combo_since) {
      throw fail(`"${p.name}" es un combo creado en Catálogo: cámbialo desde allí`);
    }
    await ProductComboItem.destroy({ where: { combo_id: p.id }, transaction });
    await p.update({ is_combo: false, is_service: true, updated_at: new Date() }, { transaction });
  });
  return { ok: true };
}

module.exports = { list, ingredients, createIngredient, getOne, save, remove, META_KEY, armarLineas, companyOf, sucursalDe, fail, COSTO_INSUMO };
