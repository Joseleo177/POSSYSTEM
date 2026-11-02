const {
  sequelize, Sequelize, Sale, Payment, PaymentJournal, PaymentJournalMethod, PaymentMethod,
  Currency, Setting, Expense, ExpenseCategory, Income, IncomeCategory, CasheaSettlement,
} = require("../../models");
const { getSaleBalance } = require("../payments/shared");
const { liveReturnedTotal } = require("../returns/shared");
const createPayment = require("../payments/createPayment");
const { assertWarehouseAccess, scopeWarehouseIds } = require("../../middleware/auth");
const { resolveMethod } = require("../../utils/journalMethod");
const { toLocalDate, TIMEZONE } = require("../../utils/localDate");

// Ventas con Cashea (decisiones del usuario, 02-11-2026).
//
// El cliente paga una inicial en la tienda —el % que le toca según su nivel, y es Cashea quien
// se lo dice al cajero— y Cashea financia el resto. Para la tienda la venta queda cobrada: lo
// financiado no se le cobra al cliente, se lo paga Cashea días después, descontando su comisión.
//
//   · Al vender: lo financiado entra como un cobro contra el diario "Cashea" (type 'cashea',
//     moneda base, compartido por todas las sucursales). Se crea solo la primera vez. Su saldo
//     es lo que Cashea debe. La inicial se cobra después con el cobro de siempre.
//   · Al depositar Cashea: la liquidación marca esos cobros (payments.cashea_settlement_id) y
//     asienta un EGRESO del diario Cashea y un INGRESO en el banco por lo que llegó, más un
//     EGRESO "Comisión Cashea" por la diferencia. No hace falta saber de antemano cuánto cobra
//     Cashea: la comisión es lo que no llegó.
//
// Los tres movimientos llevan cashea_settlement_id: se anulan juntos, y el reporte de finanzas
// trata el traspaso como el avance de efectivo (sale de la columna Cashea y entra en la del
// banco); solo la comisión es un egreso de verdad.

const TYPE = "cashea";
const SETTING_KEY = "pos_cashea";
const LIQUIDACION = "Liquidación Cashea";
const COMISION = "Comisión Cashea";

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const round6 = (n) => parseFloat((parseFloat(n) || 0).toFixed(6));
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
const companyOf = (req) => req?.company_id ?? req?.employee?.company_id ?? null;

// Opción de cada empresa (Configuración → Punto de venta), como los avances de efectivo.
async function exigirActivo(companyId, transaction) {
  const row = companyId ? await Setting.findOne({ where: { key: SETTING_KEY, company_id: companyId }, transaction }) : null;
  if (row?.value !== "true") {
    throw fail("Las ventas con Cashea no están activas en esta empresa (Configuración → Punto de venta)", 403);
  }
}

// El diario "Cashea" de la empresa; con `crear`, lo da de alta la primera vez junto con su
// método. Va en moneda base y sin sucursales: lo que debe Cashea es de la empresa.
async function diarioCashea(companyId, { crear = false, transaction } = {}) {
  const where = { type: TYPE, merged_into_id: null, ...(companyId ? { company_id: companyId } : {}) };
  const existente = await PaymentJournal.findOne({ where, order: [["active", "DESC"], ["id", "ASC"]], transaction });
  if (existente || !crear) return existente;

  const base = await Currency.findOne({ where: { is_base: true, ...(companyId ? { company_id: companyId } : {}) }, transaction });
  let metodo = await PaymentMethod.findOne({ where: { code: TYPE, ...(companyId ? { company_id: companyId } : {}) }, transaction });
  if (!metodo) {
    // El nombre es único por empresa: si alguien ya creó un "Cashea" a mano con otro código, el
    // nuestro se distingue.
    const ocupado = await PaymentMethod.findOne({ where: { name: "Cashea", ...(companyId ? { company_id: companyId } : {}) }, transaction });
    metodo = await PaymentMethod.create({
      name: ocupado ? "Cashea (financiado)" : "Cashea", code: TYPE, color: "#E5B800",
      active: true, allows_outflow: true, sort_order: 90, company_id: companyId,
    }, { transaction });
  }
  const diario = await PaymentJournal.create({
    name: "Cashea", type: TYPE, company_id: companyId, warehouse_id: null, color: "#E5B800",
    active: true, sort_order: 90, currency_id: base?.id ?? null,
  }, { transaction });
  await PaymentJournalMethod.create({
    journal_id: diario.id, company_id: companyId, method_code: metodo.code,
    allows_inflow: true, allows_outflow: true, sort_order: 0,
  }, { transaction });
  return diario;
}

/**
 * Venta con Cashea: registra lo financiado como cobro contra el diario Cashea.
 *
 * `inicial`: lo que paga el cliente en la tienda, en moneda base (lo dice Cashea). Lo financiado
 * es el saldo de la venta menos la inicial. La inicial se cobra después, con el cobro de siempre:
 * así sirven el vuelto, los bolívares y el pago combinado sin repetir nada aquí.
 */
async function registrarVenta(saleId, body, req) {
  const companyId = companyOf(req);
  await exigirActivo(companyId);

  const inicial = round2(String(body?.inicial ?? "").replace(",", "."));
  if (!(inicial >= 0)) throw fail("Indica la inicial que paga el cliente");
  const orden = String(body?.order_number || "").trim().slice(0, 100) || null;

  const sale = await Sale.findByPk(saleId);
  if (!sale) throw fail("Factura no encontrada", 404);
  await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });
  if (!["borrador", "espera", "pendiente", "parcial"].includes(sale.status)) {
    throw fail("Esta venta no está por cobrar");
  }
  // La tasa de divisas es una rebaja por pagar de contado en divisas: no aplica a lo que paga
  // Cashea.
  if (parseFloat(sale.fx_rate) > 0) throw fail("Esta venta tiene tasa de divisas: con Cashea se vende a precio normal");

  // Primera vez: se crea el diario, en su propia transacción (queda aunque el cobro falle).
  const diario = await sequelize.transaction(t => diarioCashea(companyId, { crear: true, transaction: t }));
  if (!diario.active) throw fail("El diario Cashea está inactivo (Contabilidad → Diarios)");

  const yaTiene = await Payment.count({ where: { sale_id: sale.id, payment_journal_id: diario.id } });
  if (yaTiene) throw fail("Esta venta ya tiene registrada la parte de Cashea");

  const pagado = await getSaleBalance(sale.id);
  const devuelto = await liveReturnedTotal(sale.id);
  const saldo = Math.max(0, parseFloat(sale.total) - devuelto - pagado);
  const financiado = round6(saldo - inicial);
  if (!(financiado > 0.004)) throw fail("La inicial no puede ser igual o mayor que lo que falta por cobrar");

  const base = diario.currency_id ? await Currency.findByPk(diario.currency_id) : null;
  return createPayment({
    sale_id: sale.id,
    amount: financiado,
    currency_id: base?.id ?? null,
    exchange_rate: 1,
    payment_journal_id: diario.id,
    payment_method: TYPE,
    employee_id: req?.employee?.id ?? null,
    reference_date: hoy(),
    reference_number: orden,
    notes: `Financiado por Cashea · inicial ${inicial.toFixed(2)}`,
    // Con inicial, este cobro no cierra la venta: la cierra el de la inicial.
    _noSettle: inicial > 0.004,
  }, req);
}

// Filtro de sucursal: un admin ve todo; el resto, las ventas de sus sucursales.
async function filtroSucursal(req, alias = "s") {
  const ids = await scopeWarehouseIds(req);
  if (!Array.isArray(ids)) return "";
  const limpios = ids.map(Number).filter(Number.isInteger);
  return limpios.length ? `AND ${alias}.warehouse_id IN (${limpios.join(",")})` : "AND FALSE";
}

/**
 * Lo que Cashea debe: los cobros financiados que todavía no entraron en una liquidación, con su
 * venta. Y el resumen: total que debe, cuántas ventas, y la comisión del mes en curso.
 */
async function pendientes(req) {
  const companyId = companyOf(req);
  const wh = await filtroSucursal(req);
  const rep = { cid: companyId, type: TYPE };
  const rows = await sequelize.query(`
    SELECT p.id, p.sale_id, p.amount::float AS amount, p.created_at, p.reference_number,
           s.invoice_number, s.total::float AS sale_total, s.warehouse_id, w.name AS warehouse_name,
           COALESCE(c.name, s.web_customer_name) AS customer_name
      FROM payments p
      JOIN payment_journals pj ON pj.id = p.payment_journal_id AND pj.type = :type
      JOIN sales s ON s.id = p.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN warehouses w ON w.id = s.warehouse_id
     WHERE p.cashea_settlement_id IS NULL
       AND s.status <> 'anulado'
       ${companyId ? "AND p.company_id = :cid" : ""}
       ${wh}
     ORDER BY p.created_at ASC, p.id ASC
  `, { replacements: rep, type: Sequelize.QueryTypes.SELECT });

  const [mes] = await sequelize.query(`
    SELECT COALESCE(SUM(commission), 0)::float AS commission, COALESCE(SUM(owed_amount), 0)::float AS owed
      FROM cashea_settlements
     WHERE status = 'activo'
       AND date >= date_trunc('month', (NOW() AT TIME ZONE '${TIMEZONE}'))::date
       ${companyId ? "AND company_id = :cid" : ""}
  `, { replacements: rep, type: Sequelize.QueryTypes.SELECT });

  return {
    items: rows,
    summary: {
      owed: round2(rows.reduce((a, r) => a + r.amount, 0)),
      count: rows.length,
      month_commission: round2(mes?.commission),
      month_settled: round2(mes?.owed),
    },
  };
}

// Liquidaciones registradas, de la más reciente a la más vieja.
async function liquidaciones(req, { limit = 50 } = {}) {
  const companyId = companyOf(req);
  const rows = await sequelize.query(`
    SELECT cs.id, cs.date, cs.reference, cs.notes, cs.status, cs.sale_count, cs.created_at,
           cs.owed_amount::float AS owed_amount, cs.received_amount::float AS received_amount,
           cs.rate::float AS rate, cs.received_base::float AS received_base,
           cs.commission::float AS commission, cs.journal_id, cs.payment_method,
           pj.name AS journal_name, c.symbol AS currency_symbol, COALESCE(c.is_base, true) AS is_base,
           e.full_name AS employee_name
      FROM cashea_settlements cs
      LEFT JOIN payment_journals pj ON pj.id = cs.journal_id
      LEFT JOIN currencies c ON c.id = pj.currency_id
      LEFT JOIN employees e ON e.id = cs.employee_id
     WHERE TRUE ${companyId ? "AND cs.company_id = :cid" : ""}
     ORDER BY cs.date DESC, cs.id DESC
     LIMIT :lim
  `, { replacements: { cid: companyId, lim: Math.min(200, parseInt(limit) || 50) }, type: Sequelize.QueryTypes.SELECT });
  return rows;
}

/**
 * Registra un depósito de Cashea.
 *
 * `payment_ids`: los cobros financiados que paga este depósito. `journal_id` / `payment_method`:
 * la cuenta y el método por donde entró. `received_amount`: lo que llegó, en la moneda de esa
 * cuenta; `rate`: su tasa (vacío = la del sistema). La comisión es lo debido menos lo que llegó.
 */
async function liquidar(body, req) {
  const companyId = companyOf(req);
  const ids = [...new Set((Array.isArray(body?.payment_ids) ? body.payment_ids : []).map(Number).filter(Number.isInteger))];
  if (!ids.length) throw fail("Marca las ventas que paga este depósito");
  const recibido = round2(String(body?.received_amount ?? "").replace(",", "."));
  if (!(recibido > 0)) throw fail("Indica cuánto depositó Cashea");
  if (!body?.journal_id) throw fail("Indica la cuenta en la que depositó Cashea");
  const fecha = String(body?.date || "").slice(0, 10) || hoy();
  const referencia = String(body?.reference || "").trim().slice(0, 50) || null;
  const empleado = req?.employee?.id ?? null;
  if (!empleado) throw fail("Sesión sin empleado", 401);

  const t = await sequelize.transaction();
  try {
    await exigirActivo(companyId, t);
    const cashea = await diarioCashea(companyId, { transaction: t });
    if (!cashea) throw fail("Todavía no hay ventas con Cashea");

    const cobros = await Payment.findAll({ where: { id: ids }, transaction: t, lock: true });
    if (cobros.length !== ids.length) throw fail("Alguna de esas ventas ya no está disponible. Recarga la lista.");
    if (cobros.some(p => p.payment_journal_id !== cashea.id)) throw fail("Solo se liquidan cobros de Cashea");
    if (cobros.some(p => p.cashea_settlement_id)) throw fail("Alguna de esas ventas ya fue liquidada. Recarga la lista.");
    const ventas = await Sale.findAll({ where: { id: [...new Set(cobros.map(p => p.sale_id))] }, attributes: ["id", "warehouse_id", "status"], transaction: t });
    for (const v of ventas) await assertWarehouseAccess(req, v.warehouse_id, { optional: true });

    const banco = await PaymentJournal.findByPk(body.journal_id, { transaction: t });
    if (!banco || !banco.active) throw fail("Cuenta no encontrada", 404);
    if (banco.type === TYPE) throw fail("El depósito entra en una cuenta del banco, no en Cashea");
    const moneda = banco.currency_id ? await Currency.findByPk(banco.currency_id, { transaction: t }) : null;
    const esBase = !moneda || moneda.is_base;
    const tasa = esBase ? 1 : (parseFloat(String(body?.rate ?? "").replace(",", ".")) || parseFloat(moneda.exchange_rate) || 0);
    if (!(tasa > 0)) throw fail("Falta la tasa de la moneda de esa cuenta");

    const debia = round2(cobros.reduce((a, p) => a + parseFloat(p.amount || 0), 0));
    const llegoBase = round2(recibido / tasa);
    // Llegó más de lo debido: casi siempre es la tasa o un monto mal tecleado. Un céntimo de
    // redondeo se acepta y se da por exacto.
    if (llegoBase > debia + 0.01) {
      throw fail(`Llegaron ${llegoBase.toFixed(2)} y Cashea debía ${debia.toFixed(2)} por esas ventas: revisa el monto${esBase ? "" : " o la tasa"}`);
    }
    const traspaso = Math.min(llegoBase, debia);
    const comision = round2(debia - traspaso);
    const metodo = await resolveMethod(banco.id, body?.payment_method || null, "in", { transaction: t });
    const metodoCashea = await resolveMethod(cashea.id, TYPE, "out", { transaction: t, strict: false });

    const liq = await CasheaSettlement.create({
      company_id: companyId, journal_id: banco.id, payment_method: metodo, cashea_journal_id: cashea.id,
      sale_count: new Set(cobros.map(p => p.sale_id)).size,
      owed_amount: debia, received_amount: recibido, rate: tasa, received_base: traspaso,
      commission: comision, date: fecha, reference: referencia,
      notes: String(body?.notes || "").trim() || null, employee_id: empleado, status: "activo",
    }, { transaction: t });
    await Payment.update({ cashea_settlement_id: liq.id }, { where: { id: ids }, transaction: t });

    const [catLiqE] = await ExpenseCategory.findOrCreate({ where: { name: LIQUIDACION }, defaults: { name: LIQUIDACION, active: true }, transaction: t });
    const [catLiqI] = await IncomeCategory.findOrCreate({ where: { name: LIQUIDACION }, defaults: { name: LIQUIDACION, active: true }, transaction: t });
    const [catCom] = await ExpenseCategory.findOrCreate({ where: { name: COMISION }, defaults: { name: COMISION, active: true }, transaction: t });

    // Todas de una sucursal: los movimientos son de ella. Si mezcla, quedan de la empresa.
    const sucursales = [...new Set(ventas.map(v => v.warehouse_id).filter(Boolean))];
    const comun = {
      employee_id: empleado, warehouse_id: sucursales.length === 1 ? sucursales[0] : null,
      cashea_settlement_id: liq.id, status: "activo", date: toLocalDate(fecha), reference: referencia,
    };
    const titulo = `Liquidación Cashea #${liq.id} (${liq.sale_count} ${liq.sale_count === 1 ? "venta" : "ventas"})`;
    const baseId = cashea.currency_id ?? null;

    if (traspaso > 0) {
      await Expense.create({
        ...comun, description: titulo, amount: traspaso, rate: 1, currency_id: baseId,
        category_id: catLiqE.id, payment_journal_id: cashea.id, payment_method: metodoCashea,
      }, { transaction: t });
      // En la moneda del banco: monto × tasa devuelve lo que llegó, al céntimo.
      await Income.create({
        ...comun, description: titulo, amount: esBase ? traspaso : round6(recibido / tasa), rate: tasa,
        currency_id: moneda?.id ?? null, category_id: catLiqI.id,
        payment_journal_id: banco.id, payment_method: metodo,
      }, { transaction: t });
    }
    if (comision > 0) {
      await Expense.create({
        ...comun, description: `Comisión — ${titulo}`, amount: comision, rate: 1, currency_id: baseId,
        category_id: catCom.id, payment_journal_id: cashea.id, payment_method: metodoCashea,
      }, { transaction: t });
    }

    await t.commit();
    return { id: liq.id, owed_amount: debia, received_base: traspaso, commission: comision, sale_count: liq.sale_count };
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

// Anula una liquidación entera: sus movimientos y la marca de los cobros, que vuelven a deberse.
async function anularLiquidacion(id, transaction = null) {
  const propia = !transaction;
  const t = transaction || await sequelize.transaction();
  try {
    const liq = await CasheaSettlement.findByPk(id, { transaction: t, lock: true });
    if (!liq) throw fail("Liquidación no encontrada", 404);
    if (liq.status === "anulado") throw fail("Esa liquidación ya está anulada");
    await liq.update({ status: "anulado" }, { transaction: t });
    await Expense.update({ status: "anulado" }, { where: { cashea_settlement_id: liq.id }, transaction: t });
    await Income.update({ status: "anulado" }, { where: { cashea_settlement_id: liq.id }, transaction: t });
    await Payment.update({ cashea_settlement_id: null }, { where: { cashea_settlement_id: liq.id }, transaction: t });
    if (propia) await t.commit();
    return { id: liq.id };
  } catch (e) {
    if (propia) await t.rollback();
    throw e;
  }
}

module.exports = {
  registrarVenta, pendientes, liquidaciones, liquidar, anularLiquidacion, diarioCashea,
  TYPE, SETTING_KEY, LIQUIDACION, COMISION,
};
