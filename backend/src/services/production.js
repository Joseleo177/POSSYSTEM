const { Product, ProductStock, RecipeSheet, PreparationItem, ProductionBatch, ProductionBatchItem, sequelize, Sequelize } = require("../models");
const { isIntegerUnit } = require("../utils/units");
const { moveStock, unitCostOf, ownWarehouse, lockNumbering } = require("./factory/shared");
const { armarLineas, companyOf, sucursalDe, fail, COSTO_INSUMO } = require("./recipes");

// Producción de cocina (app Recetas, fase 2): la olla de sopa.
//
// Una PREPARACIÓN es un producto con existencia que la cocina hace por tanda: la sopa (en
// porciones), la salsa (en litros), la masa (en kilos). Su ficha dice qué lleva una tanda y
// cuánto rinde. Cada vez que la hacen se registra una TANDA (OP-0001) con lo que se gastó y lo
// que salió de verdad: se descuentan los insumos, se suma lo que salió y su costo real (lo
// gastado ÷ lo que salió) queda en la ficha de la sucursal, que es el costo que toman los
// platos que la llevan ("Sancocho" = 1 porción de sopa). Ver la migración 20261101110000.

const round3 = (n) => Math.round(n * 1000) / 1000;
const round4 = (n) => Math.round(n * 10000) / 10000;
const int = (v) => (Number.isInteger(Number(v)) ? Number(v) : NaN);

// En qué se cuenta lo que sale de la olla. PORCION es contable: van platos enteros.
const UNIDADES = ["PORCION", "KG", "LITRO", "UNIDAD"];
const MAX_TANDA = 99999;   // neto por línea de una tanda: una olla grande lleva kilos, no gramos

const opCode = (n) => `OP-${String(n).padStart(4, "0")}`;

async function prepDe(cid, productId, transaction, lock = false) {
  const id = int(productId);
  if (!Number.isInteger(id)) throw fail("Preparación no válida");
  const p = await Product.findOne({ where: { id, company_id: cid }, transaction, ...(lock ? { lock: true } : {}) });
  if (!p) throw fail("La preparación ya no existe", 404);
  const ficha = await RecipeSheet.findOne({ where: { product_id: p.id, kind: "preparacion" }, transaction });
  if (!ficha) throw fail(`"${p.name}" no es una preparación`);
  return { p, ficha };
}

function leerRinde(raw, unit) {
  const n = round3(parseFloat(String(raw ?? "").replace(",", ".")) || 0);
  if (!(n > 0) || n > MAX_TANDA) throw fail("Escribe cuánto rinde una tanda");
  if (isIntegerUnit(unit) && !Number.isInteger(n)) throw fail("Lo que rinde va en unidades enteras");
  return n;
}

/** Las preparaciones de la empresa, con su costo de tanda y su existencia en la sucursal. */
async function listPreparations(req, query = {}) {
  const cid = companyOf(req);
  const wid = await sucursalDe(req, query.warehouse_id);
  const filas = await sequelize.query(`
    SELECT p.id, p.name, p.unit, rs.batch_yield, rs.updated_at,
           ps.qty, ps.cost_price AS last_cost,
           r.lines, r.cost, r.sin_costo,
           (SELECT COUNT(DISTINCT ci.combo_id)::int FROM product_combo_items ci WHERE ci.product_id = p.id) AS used_in,
           (SELECT MAX(b.created_at) FROM production_batches b
             WHERE b.product_id = p.id AND b.status = 'hecha'
               AND (CAST(:wid AS int) IS NULL OR b.warehouse_id = CAST(:wid AS int))) AS last_batch_at
      FROM recipe_sheets rs
      JOIN products p ON p.id = rs.product_id
      LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = CAST(:wid AS int)
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS lines,
               SUM(pi.quantity * ${COSTO_INSUMO}) AS cost,
               COUNT(*) FILTER (WHERE ${COSTO_INSUMO} = 0)::int AS sin_costo
          FROM preparation_items pi
          JOIN products i ON i.id = pi.product_id
          LEFT JOIN product_stock ips ON ips.product_id = i.id AND ips.warehouse_id = CAST(:wid AS int)
         WHERE pi.prep_id = p.id
      ) r ON true
     WHERE rs.company_id = :cid AND rs.kind = 'preparacion'
     ORDER BY p.name`,
    { replacements: { cid, wid }, type: Sequelize.QueryTypes.SELECT });

  return {
    data: filas.map(f => {
      const rinde = parseFloat(f.batch_yield) || 0;
      const cost = round4(parseFloat(f.cost) || 0);
      return {
        product_id: f.id,
        name: f.name,
        unit: f.unit,
        batch_yield: rinde,
        lines: f.lines || 0,
        missing_costs: f.sin_costo || 0,
        batch_cost: cost,
        unit_cost: rinde > 0 ? round4(cost / rinde) : null,
        last_cost: f.last_cost == null ? null : parseFloat(f.last_cost),
        stock: f.qty == null ? null : parseFloat(f.qty),
        used_in: f.used_in || 0,
        last_batch_at: f.last_batch_at,
        updated_at: f.updated_at,
      };
    }),
  };
}

/** La ficha de una preparación: qué lleva una tanda, con el costo de cada insumo en la sucursal. */
async function getPreparation(req, productId, query = {}) {
  const cid = companyOf(req);
  const wid = await sucursalDe(req, query.warehouse_id);
  const { p, ficha } = await prepDe(cid, productId);
  const lineas = await sequelize.query(`
    SELECT pi.product_id, pi.quantity, pi.net_quantity, pi.waste_pct,
           i.name, i.unit, i.sellable, ${COSTO_INSUMO} AS cost, ips.qty
      FROM preparation_items pi
      JOIN products i ON i.id = pi.product_id
      LEFT JOIN product_stock ips ON ips.product_id = i.id AND ips.warehouse_id = CAST(:wid AS int)
     WHERE pi.prep_id = :pid
     ORDER BY pi.id`,
    { replacements: { pid: p.id, wid }, type: Sequelize.QueryTypes.SELECT });
  const ps = wid ? await ProductStock.findOne({ where: { warehouse_id: wid, product_id: p.id }, attributes: ["qty", "cost_price"] }) : null;
  const usos = await sequelize.query(`
    SELECT DISTINCT c.id, c.name FROM product_combo_items ci JOIN products c ON c.id = ci.combo_id
     WHERE ci.product_id = :pid ORDER BY c.name LIMIT 20`,
    { replacements: { pid: p.id }, type: Sequelize.QueryTypes.SELECT });

  return {
    data: {
      product_id: p.id,
      name: p.name,
      unit: p.unit,
      batch_yield: parseFloat(ficha.batch_yield) || 0,
      instructions: ficha.instructions || "",
      prep_minutes: ficha.prep_minutes ?? null,
      stock: ps?.qty == null ? null : parseFloat(ps.qty),
      last_cost: ps?.cost_price == null ? null : parseFloat(ps.cost_price),
      used_in: usos.map(u => ({ product_id: u.id, name: u.name })),
      lines: lineas.map(l => {
        const qty = parseFloat(l.quantity);
        return {
          product_id: l.product_id, name: l.name, unit: l.unit, sellable: l.sellable,
          quantity: qty,
          net_quantity: l.net_quantity != null ? parseFloat(l.net_quantity) : qty,
          waste_pct: parseFloat(l.waste_pct) || 0,
          unit_cost: round4(parseFloat(l.cost) || 0),
          stock: l.qty == null ? null : parseFloat(l.qty),
        };
      }),
    },
  };
}

// Guarda la tanda y la ficha. El costo teórico por unidad queda como costo del catálogo de la
// preparación: así un plato que la lleva tiene costo antes de la primera olla. La primera
// tanda real lo reemplaza en la ficha de la sucursal.
async function guardarFicha(req, cid, p, body, transaction) {
  const lineas = await armarLineas(cid, body.lines, p.id, transaction, { max: MAX_TANDA });
  const rinde = leerRinde(body.batch_yield, p.unit);
  const instructions = String(body.instructions ?? "").trim().slice(0, 4000) || null;
  const prep = body.prep_minutes === "" || body.prep_minutes == null ? null : int(body.prep_minutes);
  if (prep !== null && !(Number.isInteger(prep) && prep >= 0 && prep <= 1440)) throw fail("Minutos de preparación no válidos");

  await PreparationItem.destroy({ where: { prep_id: p.id }, transaction });
  await PreparationItem.bulkCreate(lineas.map(l => ({ ...l, prep_id: p.id, company_id: cid })), { transaction });

  const costos = await Product.findAll({ where: { id: lineas.map(l => l.product_id) }, attributes: ["id", "cost_price"], transaction });
  const costoDe = new Map(costos.map(c => [c.id, parseFloat(c.cost_price) || 0]));
  const tanda = lineas.reduce((a, l) => a + l.quantity * (costoDe.get(l.product_id) || 0), 0);
  await p.update({ cost_price: round4(tanda / rinde), updated_at: new Date() }, { transaction });

  const ficha = await RecipeSheet.findOne({ where: { product_id: p.id }, transaction });
  const datos = { kind: "preparacion", batch_yield: rinde, instructions, prep_minutes: prep, updated_by: req.employee?.id ?? null };
  if (ficha) await ficha.update(datos, { transaction });
  else await RecipeSheet.create({ ...datos, product_id: p.id, company_id: cid }, { transaction });
}

/**
 * Preparación nueva: crea el producto (con existencia, no se vende suelto) y su ficha. Con
 * `product_id` convierte en preparación un producto que ya existe (la salsa que se compraba
 * hecha y ahora se hace en casa).
 */
async function createPreparation(req, body = {}) {
  const cid = companyOf(req);
  const id = await sequelize.transaction(async (transaction) => {
    let p;
    if (body.product_id) {
      p = await Product.findOne({ where: { id: int(body.product_id), company_id: cid }, transaction, lock: true });
      if (!p) throw fail("El producto ya no existe", 404);
      if (p.is_combo || p.is_service || p.is_addon || p.is_variant_parent || p.piece_mode) {
        throw fail(`"${p.name}" no lleva existencia propia: una preparación tiene que poder guardarse`);
      }
      if (await RecipeSheet.findOne({ where: { product_id: p.id }, transaction })) throw fail(`"${p.name}" ya tiene ficha`);
    } else {
      const name = String(body.name || "").replace(/\s+/g, " ").trim();
      if (name.length < 2 || name.length > 200) throw fail("Escribe el nombre de la preparación");
      const unit = String(body.unit || "").toUpperCase();
      if (!UNIDADES.includes(unit)) throw fail("Elige en qué se cuenta: porciones, kilos, litros o unidades");
      const repetido = await Product.findOne({
        where: { company_id: cid, name: { [Sequelize.Op.iLike]: name.replace(/[\\%_]/g, (m) => `\\${m}`) } },
        attributes: ["id", "name"], transaction,
      });
      if (repetido) throw fail(`Ya existe "${repetido.name}"`, 409);
      p = await Product.create({ name, unit, price: 0, cost_price: 0, sellable: false, qty_step: 1, company_id: cid }, { transaction });
    }
    await guardarFicha(req, cid, p, body, transaction);
    return p.id;
  });
  return getPreparation(req, id, { warehouse_id: body.warehouse_id });
}

async function savePreparation(req, productId, body = {}) {
  const cid = companyOf(req);
  await sequelize.transaction(async (transaction) => {
    const { p } = await prepDe(cid, productId, transaction, true);
    await guardarFicha(req, cid, p, body, transaction);
  });
  return getPreparation(req, productId, { warehouse_id: body.warehouse_id });
}

/**
 * Deja de ser preparación: se borra su receta de tanda, el producto y su existencia quedan
 * (las tandas hechas no se tocan). Para borrar el producto está el Catálogo.
 */
async function removePreparation(req, productId) {
  const cid = companyOf(req);
  await sequelize.transaction(async (transaction) => {
    const { p, ficha } = await prepDe(cid, productId, transaction, true);
    await PreparationItem.destroy({ where: { prep_id: p.id }, transaction });
    await ficha.destroy({ transaction });
  });
  return { ok: true };
}

// ── Tandas ────────────────────────────────────────────────────────────────────

function aFila(b) {
  const esperado = b.expected_yield == null ? null : parseFloat(b.expected_yield);
  const salio = parseFloat(b.actual_yield);
  return {
    id: b.id,
    code: opCode(b.number),
    product_id: b.product_id,
    product_name: b.product_name,
    unit: b.unit,
    warehouse_id: b.warehouse_id,
    warehouse_name: b.warehouse_name,
    batches: parseFloat(b.batches),
    expected_yield: esperado,
    actual_yield: salio,
    total_cost: parseFloat(b.total_cost),
    unit_cost: parseFloat(b.unit_cost),
    notes: b.notes,
    status: b.status,
    employee_name: b.employee_name,
    created_at: b.created_at,
    annulled_at: b.annulled_at,
  };
}

const BATCH_SQL = `
  SELECT b.*, p.name AS product_name, p.unit, w.name AS warehouse_name, e.full_name AS employee_name
    FROM production_batches b
    JOIN products p ON p.id = b.product_id
    JOIN warehouses w ON w.id = b.warehouse_id
    LEFT JOIN employees e ON e.id = b.employee_id`;

/** Las tandas hechas, las más nuevas primero. */
async function listBatches(req, query = {}) {
  const cid = companyOf(req);
  const wid = await sucursalDe(req, query.warehouse_id);
  const pid = parseInt(query.product_id, 10) || null;
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  const filas = await sequelize.query(`${BATCH_SQL}
     WHERE b.company_id = :cid
       AND (CAST(:wid AS int) IS NULL OR b.warehouse_id = CAST(:wid AS int))
       AND (CAST(:pid AS int) IS NULL OR b.product_id = CAST(:pid AS int))
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT :limit OFFSET :offset`,
    { replacements: { cid, wid, pid, limit, offset }, type: Sequelize.QueryTypes.SELECT });
  return { data: filas.map(aFila) };
}

async function getBatch(req, id) {
  const cid = companyOf(req);
  const [b] = await sequelize.query(`${BATCH_SQL} WHERE b.company_id = :cid AND b.id = :id`,
    { replacements: { cid, id: int(id) }, type: Sequelize.QueryTypes.SELECT });
  if (!b) throw fail("La producción ya no existe", 404);
  const lineas = await sequelize.query(`
    SELECT bi.*, i.name, i.unit FROM production_batch_items bi JOIN products i ON i.id = bi.product_id
     WHERE bi.batch_id = :id ORDER BY bi.id`,
    { replacements: { id: b.id }, type: Sequelize.QueryTypes.SELECT });
  return {
    data: {
      ...aFila(b),
      lines: lineas.map(l => ({
        product_id: l.product_id, name: l.name, unit: l.unit,
        expected_qty: l.expected_qty == null ? null : parseFloat(l.expected_qty),
        actual_qty: parseFloat(l.actual_qty),
        unit_cost: parseFloat(l.unit_cost),
        cost: parseFloat(l.cost),
      })),
    },
  };
}

/**
 * Registra una tanda: { product_id, warehouse_id, batches, actual_yield, notes,
 * lines: [{ product_id, actual_qty }] } con lo que se usó de verdad, en la unidad de cada
 * insumo. Lo que pedía la receta (× tandas) se guarda al lado para ver la diferencia.
 *
 * No bloquea por existencia: lo que se echó a la olla ya se gastó, y negarse a registrarlo
 * dejaría al inventario mintiendo (mismo criterio que Fábrica y que "vender sin insumo").
 */
async function createBatch(req, body = {}) {
  const cid = companyOf(req);
  const id = await sequelize.transaction(async (transaction) => {
    const { p, ficha } = await prepDe(cid, body.product_id, transaction, true);
    const wid = await ownWarehouse(req, body.warehouse_id, transaction);

    const tandas = Math.round((parseFloat(String(body.batches ?? 1).replace(",", ".")) || 0) * 100) / 100;
    if (!(tandas > 0) || tandas > 1000) throw fail("Cantidad de tandas no válida");
    const salio = leerRinde(body.actual_yield, p.unit);
    const rinde = parseFloat(ficha.batch_yield) || 0;
    const esperado = rinde > 0 ? round3(rinde * tandas) : null;

    // Lo que pedía la receta, para comparar.
    const receta = await PreparationItem.findAll({ where: { prep_id: p.id }, transaction });
    const pedia = new Map(receta.map(r => [r.product_id, round3(parseFloat(r.quantity) * tandas)]));

    const raw = Array.isArray(body.lines) ? body.lines : [];
    if (!raw.length) throw fail("Di qué se usó en la tanda");
    if (raw.length > 60) throw fail("Demasiados insumos en una tanda");
    const lineas = raw.map(l => ({ product_id: int(l.product_id), qty: round3(parseFloat(String(l.actual_qty ?? "").replace(",", ".")) || 0) }));
    if (lineas.some(l => !Number.isInteger(l.product_id))) throw fail("Insumo no válido");
    if (new Set(lineas.map(l => l.product_id)).size !== lineas.length) throw fail("Un insumo está repetido");
    if (lineas.some(l => l.product_id === p.id)) throw fail("La preparación no puede llevarse a sí misma");
    const usadas = lineas.filter(l => l.qty > 0);
    if (!usadas.length) throw fail("Di qué se usó en la tanda");

    const insumos = await Product.findAll({
      where: { id: usadas.map(l => l.product_id), company_id: cid },
      attributes: ["id", "name", "unit", "is_combo", "is_service", "is_addon", "is_variant_parent", "piece_mode"],
      transaction,
    });
    const porId = new Map(insumos.map(i => [i.id, i]));
    for (const l of usadas) {
      const i = porId.get(l.product_id);
      if (!i) throw fail("Uno de los insumos ya no existe");
      if (i.is_combo || i.is_service || i.is_addon || i.is_variant_parent || i.piece_mode) {
        throw fail(`"${i.name}" no lleva existencia propia`);
      }
      if (l.qty > MAX_TANDA) throw fail(`Cantidad no válida de "${i.name}"`);
      if (isIntegerUnit(i.unit) && !Number.isInteger(l.qty)) throw fail(`"${i.name}" se cuenta por unidades enteras`);
    }

    await lockNumbering("produccion", cid, transaction);
    const max = await ProductionBatch.max("number", { where: { company_id: cid }, transaction });
    const numero = (parseInt(max) || 0) + 1;
    const code = opCode(numero);

    const batch = await ProductionBatch.create({
      company_id: cid, number: numero, warehouse_id: wid, product_id: p.id,
      batches: tandas, expected_yield: esperado, actual_yield: salio,
      notes: String(body.notes || "").trim().slice(0, 300) || null,
      employee_id: req.employee?.id ?? null,
    }, { transaction });

    let total = 0;
    for (const l of usadas) {
      const i = porId.get(l.product_id);
      const costo = await unitCostOf(i.id, wid, transaction);
      const linea = round4(costo * l.qty);
      total += linea;
      await ProductionBatchItem.create({
        company_id: cid, batch_id: batch.id, product_id: i.id,
        expected_qty: pedia.has(i.id) ? pedia.get(i.id) : null,
        actual_qty: l.qty, unit_cost: round4(costo), cost: linea,
      }, { transaction });
      await moveStock({ productId: i.id, warehouseId: wid, delta: -l.qty, notes: `${code} · ${p.name}`, req, transaction, reason: "produccion" });
    }

    const unitario = round4(total / salio);
    await batch.update({ total_cost: round4(total), unit_cost: unitario }, { transaction });
    // Lo que salió entra con su costo real: el último, como en compras y en Fábrica.
    await moveStock({ productId: p.id, warehouseId: wid, delta: salio, notes: `${code} · Producción`, req, transaction, setCost: unitario, reason: "produccion" });
    return batch.id;
  });
  return getBatch(req, id);
}

/**
 * Anula una tanda: los insumos vuelven y lo que salió se retira (aunque ya se haya vendido:
 * la existencia puede quedar en negativo y se ve). El costo de la ficha vuelve al de la tanda
 * anterior de esa sucursal, si hay.
 */
async function annulBatch(req, batchId) {
  const cid = companyOf(req);
  await sequelize.transaction(async (transaction) => {
    const b = await ProductionBatch.findOne({ where: { id: int(batchId), company_id: cid }, transaction, lock: true });
    if (!b) throw fail("La producción ya no existe", 404);
    if (b.status === "anulada") throw fail("Esta producción ya está anulada");
    await ownWarehouse(req, b.warehouse_id, transaction);
    const code = opCode(b.number);
    const p = await Product.findByPk(b.product_id, { attributes: ["id", "name"], transaction });

    const lineas = await ProductionBatchItem.findAll({ where: { batch_id: b.id }, transaction });
    for (const l of lineas) {
      await moveStock({ productId: l.product_id, warehouseId: b.warehouse_id, delta: parseFloat(l.actual_qty), notes: `${code} · Anulada · ${p?.name || ""}`, req, transaction, reason: "produccion" });
    }
    const anterior = await ProductionBatch.findOne({
      where: { company_id: cid, product_id: b.product_id, warehouse_id: b.warehouse_id, status: "hecha", id: { [Sequelize.Op.ne]: b.id } },
      order: [["created_at", "DESC"], ["id", "DESC"]],
      transaction,
    });
    await moveStock({
      productId: b.product_id, warehouseId: b.warehouse_id, delta: -parseFloat(b.actual_yield),
      notes: `${code} · Anulada`, req, transaction, reason: "produccion",
      setCost: anterior ? parseFloat(anterior.unit_cost) : null,
    });
    await b.update({ status: "anulada", annulled_at: new Date(), annulled_by: req.employee?.id ?? null }, { transaction });
  });
  return getBatch(req, batchId);
}

module.exports = {
  listPreparations, getPreparation, createPreparation, savePreparation, removePreparation,
  listBatches, getBatch, createBatch, annulBatch,
};
