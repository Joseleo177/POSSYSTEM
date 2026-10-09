'use strict';

const {
  sequelize, QT, localDate, fail, r2,
  Expense, Income, ExpenseCategory, IncomeCategory, Warehouse, BankReconciliationMatch,
} = require("./shared");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { toLocalDate } = require("../../utils/localDate");
const { resolveMethod } = require("../../utils/journalMethod");

// Categorías con que la conciliación registra lo que solo conoce el banco. Se crean la
// primera vez que hacen falta, en la empresa de quien concilia.
const CATEGORY = {
  comision: { model: "expense", name: "Comisiones bancarias" },
  impuesto: { model: "expense", name: "Impuestos bancarios" },
  interes:  { model: "income",  name: "Intereses bancarios" },
};

async function findOrCreateCategory(kind, companyId, t) {
  const c = CATEGORY[kind];
  const Model = c.model === "expense" ? ExpenseCategory : IncomeCategory;
  const found = await Model.findOne({
    where: sequelize.where(sequelize.fn("lower", sequelize.col("name")), c.name.toLowerCase()),
    transaction: t,
  });
  if (found) return found.id;
  const created = await Model.create({ name: c.name, active: true, company_id: companyId }, { transaction: t });
  return created.id;
}

// Tasa del día del movimiento. No hay histórico de tasas: se toma la de los cobros de esa
// moneda en ese día (o en los anteriores más cercanos) y, si no hubo ninguno, la de hoy. El
// equivalente en Ref. de una comisión de hace dos semanas no debe calcularse a la tasa de hoy.
async function rateForDay(companyId, journal, day, t) {
  if (!journal.currency_id || journal.currency_is_base) return 1;
  const [row] = await sequelize.query(`
    SELECT p.exchange_rate
      FROM payments p
      JOIN payment_journals pj ON pj.id = p.payment_journal_id
     WHERE p.company_id = :company_id AND pj.currency_id = :currency_id
       AND p.exchange_rate > 1
       AND ${localDate("p.created_at")} BETWEEN (CAST(:day AS date) - 7) AND CAST(:day AS date)
     ORDER BY p.created_at DESC
     LIMIT 1
  `, { replacements: { company_id: companyId, currency_id: journal.currency_id, day }, type: QT.SELECT, transaction: t });
  const r = parseFloat(row?.exchange_rate || journal.currency_rate || 1);
  return r > 0 ? r : 1;
}

// Sucursal donde queda el movimiento creado. Un egreso siempre lleva sucursal (ver
// expenseController.create): la del extracto, la que eligió el usuario o, si el diario
// atiende a una sola, esa.
async function resolveWarehouse(req, statement, journal, requested, t) {
  let wid = statement.warehouse_id || (requested ? parseInt(requested, 10) : null);
  if (!wid && journal.warehouse_ids.length === 1) wid = journal.warehouse_ids[0];
  if (!wid) throw fail("Elige la sucursal donde se registra el movimiento");
  await assertWarehouseAccess(req, wid);
  const w = await Warehouse.findByPk(wid, { attributes: ["id", "name", "sells"], transaction: t });
  if (!w) throw fail("Sucursal no encontrada", 404);
  if (w.sells === false) throw fail(`${w.name} es un depósito: los movimientos se registran en un punto de venta`);
  return wid;
}

/**
 * Crea el egreso o ingreso que explica una línea (o la parte de ella que es comisión) y lo
 * deja casado con la línea como documento "creado": si la conciliación se deshace, se anula.
 */
async function createDocForLine(req, { line, ...rest }) {
  return createDocForLines(req, { lines: [line], ...rest });
}

/**
 * Igual, pero un solo documento para varias líneas: las comisiones de un extracto entran como
 * UN egreso por su total y cada línea queda casada contra él (amount = su parte). Va fechado el
 * día de la última línea, que es cuando el banco terminó de cobrarlas.
 * `amountLocal` por omisión es la suma de las líneas.
 */
async function createDocForLines(req, { companyId, statement, lines, journal, kind, amountLocal, description, categoryId, warehouseId, t }) {
  const model = kind === "interes" || (kind === "ingreso") ? "income" : "expense";
  const montoDe = (l) => r2(parseFloat(l.credit) > 0 ? l.credit : l.debit);
  const amount = r2(amountLocal ?? lines.reduce((s, l) => s + montoDe(l), 0));
  if (!(amount > 0)) throw fail("Monto inválido");
  const line = [...lines].sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();

  const rate = await rateForDay(companyId, journal, line.date, t);
  const wid = await resolveWarehouse(req, statement, journal, warehouseId, t);
  const catId = categoryId
    ? parseInt(categoryId, 10)
    : await findOrCreateCategory(CATEGORY[kind] ? kind : (model === "income" ? "interes" : "comision"), companyId, t);

  const ref = lines.length === 1 && line.reference ? String(line.reference).slice(0, 50) : null;
  const data = {
    description: String(description || line.description || "Movimiento bancario").slice(0, 255),
    // En base y con seis decimales: × tasa vuelve exacto al monto del banco.
    amount: parseFloat((amount / rate).toFixed(6)),
    currency_id: journal.currency_id || null,
    rate,
    category_id: catId,
    payment_journal_id: journal.id,
    // Por qué método de la cuenta: una comisión sale por uno que pague, un interés entra por
    // uno que reciba. Sin método pedido, el que la cuenta tenga para ese sentido.
    payment_method: await resolveMethod(journal.id, null, model === "income" ? "in" : "out", { transaction: t, strict: false }),
    reference: ref,
    notes: `Conciliación bancaria · extracto #${statement.id}`,
    employee_id: req.employee.id,
    warehouse_id: wid,
    company_id: companyId,
    status: "activo",
    date: toLocalDate(String(line.date).slice(0, 10)),
  };
  const Model = model === "income" ? Income : Expense;
  if (categoryId) {
    const Cat = model === "income" ? IncomeCategory : ExpenseCategory;
    const cat = await Cat.findByPk(catId, { transaction: t });
    if (!cat) throw fail("Categoría no encontrada", 404);
  }
  const doc = await Model.create(data, { transaction: t });
  await BankReconciliationMatch.bulkCreate(lines.map(l => ({
    company_id: companyId, line_id: l.id, source_type: model, source_id: doc.id,
    role: "creado", amount: lines.length === 1 ? amount : montoDe(l),
  })), { transaction: t });
  return { type: model, id: doc.id, amount };
}

/**
 * Líneas que se resuelven juntas: las que comparten un documento creado por la conciliación
 * (las comisiones registradas en un solo egreso). Deshacer una deshace el grupo entero, igual
 * que borrar un cobro conjunto: el egreso es uno y no se puede anular a medias.
 */
async function groupedLineIds(lineIds, t) {
  if (!lineIds.length) return [];
  const rows = await BankReconciliationMatch.sequelize.query(`
    SELECT DISTINCT m2.line_id
      FROM bank_reconciliation_matches m
      JOIN bank_reconciliation_matches m2
        ON m2.source_type = m.source_type AND m2.source_id = m.source_id AND m2.role = 'creado'
     WHERE m.role = 'creado' AND m.line_id IN (:ids)
  `, { replacements: { ids: lineIds }, type: BankReconciliationMatch.sequelize.QueryTypes.SELECT, transaction: t });
  return [...new Set([...lineIds, ...rows.map(r => r.line_id)])];
}

// Anula lo que la conciliación había creado para una línea. No se borra: un egreso anulado
// queda a la vista en Egresos, como cualquier otro.
async function voidCreatedDocs(lineIds, t) {
  if (!lineIds.length) return;
  const created = await BankReconciliationMatch.findAll({
    where: { line_id: lineIds, role: "creado" }, transaction: t, raw: true,
  });
  const exp = created.filter(m => m.source_type === "expense").map(m => m.source_id);
  const inc = created.filter(m => m.source_type === "income").map(m => m.source_id);
  if (exp.length) await Expense.update({ status: "anulado" }, { where: { id: exp, status: "activo" }, transaction: t });
  if (inc.length) await Income.update({ status: "anulado" }, { where: { id: inc, status: "activo" }, transaction: t });
}

module.exports = { createDocForLine, createDocForLines, groupedLineIds, voidCreatedDocs, findOrCreateCategory, CATEGORY };
