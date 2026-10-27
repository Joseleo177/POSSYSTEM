'use strict';

const models = require("../../models");
const { ensureOpenSession } = require("../warehouses/sessionService");
const { assertWarehouseAccess, visibleWarehouseIds } = require("../../middleware/auth");

const { sequelize, Sequelize, ProductStock, Product, StockSessionLine, Warehouse } = models;
const { Op } = Sequelize;

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

// Decimales del sistema: existencias con 3 (product_stock.qty), costos con 4 (cost_price) y
// precios con 5 (sale_items.price). Todo lo que este módulo guarda se redondea igual.
const r3 = (n) => Math.round((parseFloat(n) || 0) * 1000) / 1000;
const r4 = (n) => Math.round((parseFloat(n) || 0) * 10000) / 10000;
const r5 = (n) => Math.round((parseFloat(n) || 0) * 100000) / 100000;

// Topes de las columnas: DECIMAL(10,3) para cantidades y DECIMAL(14,4/5) para dinero. Pasarlos
// era un 500 de "numeric field overflow"; así es un 400 que dice qué está mal.
const MAX_QTY = 999999;
const MAX_MONEY = 999999999;

// Holgura al comparar tamaños: cada pieza se redondea a 0,001 por separado.
const TOL = 0.005;

// ── Modos de pieza ──────────────────────────────────────────────────────────────────────
//   area    láminas (acero, vidrio, MDF): ancho × largo, existencia en M2
//   length  tubos, perfiles, cabillas: solo largo, existencia en METRO
const MODES = {
  area:   { unit: "M2",    label: "por área" },
  length: { unit: "METRO", label: "por longitud" },
};
const isMode = (m) => Object.prototype.hasOwnProperty.call(MODES, m);
const unitOfMode = (m) => MODES[m]?.unit;

// Tamaño de una pieza en la unidad del producto, con los tres decimales de la existencia.
const sizeOf = (mode, w, l) => (mode === "length" ? r3(parseInt(l) / 1000) : r3((parseInt(w) * parseInt(l)) / 1e6));

// Las medidas se guardan en mm, pero al taller se le habla en metros: "1,22 × 2,44 m".
const fmtM = (n) => (n / 1000).toLocaleString("es-VE", { maximumFractionDigits: 3 });

const companyOf = (req) => {
  const c = req.employee?.company_id ?? null;
  if (!c) throw fail("Elige una empresa para trabajar en Fábrica");
  return parseInt(c, 10);
};

const employeeOf = (req) => req.employee?.id ?? null;

// Medida en milímetros: entero positivo y razonable (nada que se corte en un taller pasa de
// 20 m; más que eso es un error de unidad, típicamente metros escritos como milímetros).
function mm(value, label) {
  const n = Math.round(parseFloat(value));
  if (!isFinite(n) || n <= 0) throw fail(`${label}: escribe una medida mayor que cero`);
  if (n > 20000) throw fail(`${label}: ${fmtM(n)} m es demasiado largo; revisa que esté en metros`);
  return n;
}

// Medidas de una pieza según el modo del material. Devuelve lo que se guarda.
function pieceSpec(mode, w, l, label = "Pieza") {
  if (!isMode(mode)) throw fail("Ese producto no se controla por piezas");
  const length = mm(l, `${label}, largo`);
  if (mode === "length") return { width_mm: null, length_mm: length, size: sizeOf(mode, null, length) };
  const width = mm(w, `${label}, ancho`);
  return { width_mm: width, length_mm: length, size: sizeOf(mode, width, length) };
}

/**
 * Cuántos cortes de w × l (o de largo l, en tubos) salen de una pieza. Cuadrícula simple,
 * probando la pieza en las dos orientaciones, sin contar el ancho de la cuchilla: es una
 * estimación para no entregar una lámina que no alcanza, no un plan de corte. Las piezas
 * irregulares solo se pueden medir por área.
 */
const gridFits = (W, L, w, l) => Math.max(
  Math.floor(W / w) * Math.floor(L / l),
  Math.floor(W / l) * Math.floor(L / w),
);

// Una pieza con forma (retazo en L) rinde lo que rinda cada una de sus partes por separado.
const hasShape = (piece) => Array.isArray(piece.shape) && piece.shape.length > 0;

function cutsInPiece(piece, mode, w, l) {
  if (!(l > 0)) return 0;
  if (mode === "length") return Math.floor((piece.length_mm || 0) / l);
  if (!(w > 0)) return 0;
  if (hasShape(piece)) return piece.shape.reduce((s, r) => s + gridFits(r.dy, r.dx, w, l), 0);
  if (piece.is_irregular || !piece.width_mm) return Math.floor(parseFloat(piece.size || 0) / ((w * l) / 1e6));
  return gridFits(piece.width_mm, piece.length_mm, w, l);
}

/**
 * Cuántos cortes de w × l le quedan a una pieza que ya cubre otros cortes de la orden (`taken`:
 * [{ w, l, cuts }]). Lo que ya está asignado se descuenta del largo (tubos) o del área
 * (láminas), y por área además tiene que caber en la cuadrícula. Sigue siendo una estimación:
 * acomodar cortes distintos en una lámina es un plan de corte, y eso lo decide el taller.
 */
function cutsLeft(piece, mode, w, l, taken = []) {
  const grid = cutsInPiece(piece, mode, w, l);
  if (!taken.length || grid < 1) return grid;
  if (mode === "length") {
    const used = taken.reduce((s, t) => s + t.cuts * (t.l || 0), 0);
    return Math.max(0, Math.floor(((piece.length_mm || 0) - used) / l));
  }
  const used = taken.reduce((s, t) => s + t.cuts * (t.w || 0) * (t.l || 0), 0) / 1e6;
  const free = parseFloat(piece.size || 0) - used;
  return Math.max(0, Math.min(grid, Math.floor(free / ((w * l) / 1e6) + 1e-9)));
}

function money(value, label, { allowNull = true } = {}) {
  if (value == null || value === "") {
    if (allowNull) return null;
    throw fail(`${label}: escribe un monto`);
  }
  const n = parseFloat(value);
  if (!isFinite(n) || n < 0) throw fail(`${label}: el monto no es válido`);
  if (n > MAX_MONEY) throw fail(`${label}: el monto es demasiado grande`);
  return n;
}

// Texto libre recortado a lo que cabe en su columna. Vacío = null.
const text = (value, max) => {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : null;
};

const orderCode = (n) => `OF-${String(n).padStart(4, "0")}`;

/**
 * El almacén tiene que ser de la empresa y estar activo, además de estar asignado a quien
 * opera. assertWarehouseAccess deja pasar al admin sin mirar el id, así que un admin podía
 * crear órdenes o piezas apuntando al almacén de OTRA empresa: la FK solo comprueba que
 * exista. El findByPk sí pasa por el filtro de empresa.
 */
async function ownWarehouse(req, warehouseId, transaction) {
  const id = parseInt(warehouseId);
  if (!id) throw fail("Elige el almacén");
  const w = await Warehouse.findByPk(id, { transaction });
  if (!w || w.active === false) throw fail("Almacén no encontrado o inactivo", 404);
  await assertWarehouseAccess(req, id);
  return id;
}

/**
 * Mueve la existencia de un producto en un almacén y deja la línea de sesión que el kardex
 * lee (motivo 'fabricacion'). `delta` en la unidad del producto.
 *
 * No bloquea por existencia negativa a propósito: lo que se devuelve del taller ya se
 * consumió, y negarse a registrarlo dejaría al sistema mintiendo. El descuadre se ve en
 * Materiales y se corrige con un ajuste.
 */
async function moveStock({ productId, warehouseId, delta, notes, req, transaction, setCost = null }) {
  const qty = r3(delta);
  if (!qty && setCost == null) return;

  const product = await Product.findByPk(productId, { transaction, lock: true });
  if (!product) throw fail("Producto no encontrado", 404);

  const [stockEntry] = await ProductStock.findOrCreate({
    where: { warehouse_id: warehouseId, product_id: productId },
    defaults: { qty: 0 },
    transaction,
    lock: true,
  });
  const before = parseFloat(stockEntry.qty || 0);

  if (qty) {
    await stockEntry.increment("qty", { by: qty, transaction });
    const session = await ensureOpenSession({
      warehouseId,
      employeeId: employeeOf(req),
      companyId: req.employee?.company_id ?? null,
    }, transaction);
    await StockSessionLine.create({
      session_id:   session.id,
      warehouse_id: warehouseId,
      product_id:   productId,
      product_name: product.name,
      qty_before:   before,
      qty_adjusted: qty,
      qty_after:    r3(before + qty),
      type:         qty > 0 ? "in" : "out",
      reason:       "fabricacion",
      notes:        text(notes, 500),
    }, { transaction });
  }

  // Costo de la sucursal, mismo criterio que la recepción de compras: el último, no promedio.
  if (setCost != null) await stockEntry.update({ cost_price: r4(setCost) }, { transaction });

  const total = await ProductStock.sum("qty", { where: { product_id: productId }, transaction });
  await product.update({ stock: total || 0 }, { transaction });
}

// Costo unitario de un producto en una sucursal: el de su ficha si ya recibió mercancía, si no
// el del catálogo. Igual que createSale.
async function unitCostOf(productId, warehouseId, transaction) {
  const ps = await ProductStock.findOne({ where: { product_id: productId, warehouse_id: warehouseId }, transaction });
  if (ps?.cost_price != null) return parseFloat(ps.cost_price);
  const p = await Product.findByPk(productId, { attributes: ["cost_price"], transaction });
  return parseFloat(p?.cost_price || 0);
}

// Costo sin almacén elegido: el del catálogo, o el promedio de las sucursales que ya lo
// recibieron. La carga inicial y las compras dejan el costo en la ficha de la sucursal, así que
// leer solo el del producto estimaba el material en cero.
const COST_ANY_SQL = (col) => `COALESCE(${col}.cost_price, (SELECT AVG(ps.cost_price) FROM product_stock ps
  WHERE ps.product_id = ${col}.id AND ps.cost_price IS NOT NULL))`;

async function anyUnitCost(productId, transaction) {
  const [r] = await sequelize.query(`SELECT ${COST_ANY_SQL("p")}::float AS cost FROM products p WHERE p.id = :id`,
    { replacements: { id: productId }, type: Sequelize.QueryTypes.SELECT, transaction });
  return parseFloat(r?.cost || 0);
}

// Serializa la numeración por empresa (piezas u órdenes) dentro de la transacción.
async function lockNumbering(kind, companyId, transaction) {
  await sequelize.query(
    "SELECT pg_advisory_xact_lock(hashtext(:kind), :company)",
    { replacements: { kind: `fabrica_${kind}`, company: companyId }, transaction }
  );
}

async function inTransaction(fn) {
  const t = await sequelize.transaction();
  try {
    const out = await fn(t);
    await t.commit();
    return out;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

module.exports = {
  ...models, sequelize, Sequelize, Op,
  fail, r3, r4, r5, MAX_QTY, MAX_MONEY, TOL,
  MODES, isMode, unitOfMode, sizeOf, pieceSpec, cutsInPiece, cutsLeft, hasShape, mm, fmtM, money, text,
  companyOf, employeeOf, orderCode, ownWarehouse,
  moveStock, unitCostOf, anyUnitCost, COST_ANY_SQL, lockNumbering, inTransaction,
  assertWarehouseAccess, visibleWarehouseIds,
};
