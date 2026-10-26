const {
  sequelize, CashAdvance, Income, Expense, IncomeCategory, ExpenseCategory,
  PaymentJournal, Currency, CashSession, Setting, Customer, Sale,
} = require("../../models");
const { hasPermission, assertWarehouseAccess } = require("../../middleware/auth");
const { permisosVigentes } = require("../sales/lineDiscount");
const { resolveMethod } = require("../../utils/journalMethod");
const { assertJournalsInWarehouse } = require("../../utils/journalWarehouse");
const { toLocalDate } = require("../../utils/localDate");

// Avance de efectivo: el cliente pide billetes en caja y los paga por el punto (o pago móvil)
// con una comisión ENCIMA: entrega Bs.1000 y se le pasan Bs.1100 (decisión del usuario,
// 26-10-2026). Puede hacerse solo o junto a una venta, en el mismo pase del punto
// (createPayment, `cash_advance`).
//
// Se asienta con piezas que el arqueo ya cuadra (cashSessions/getSessionSummary):
//   · EGRESO de la caja de efectivo por lo entregado, categoría "Avance de efectivo";
//   · INGRESO en la cuenta que recibe por el mismo monto, categoría "Avance de efectivo";
//   · INGRESO por la comisión, categoría "Comisión por avance de efectivo": la ganancia.
// La gaveta espera Bs.1000 menos y el punto Bs.1100 más. El reporte de finanzas lo pone en la
// matriz de ingresos como el vuelto: resta en la columna de la caja y suma en la de la cuenta.
// Los tres llevan cash_advance_id: anular uno anula el avance completo.
//
// Junto a una compra NO va en la factura (el usuario lo descartó como recargo, 26-10-2026): la
// factura queda solo con lo vendido y el avance se registra con su cobro, en el mismo pase.

const AVANCE = "Avance de efectivo";
const COMISION = "Comisión por avance de efectivo";
const SETTING_KEY = "pos_cash_advance";

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const round6 = (n) => parseFloat((parseFloat(n) || 0).toFixed(6));

// Opción de cada empresa (Configuración → Punto de venta), como el cobro a tasa de divisas.
async function exigirActivo(companyId, transaction) {
  const row = companyId ? await Setting.findOne({ where: { key: SETTING_KEY, company_id: companyId }, transaction }) : null;
  if (row?.value !== "true") {
    throw fail("Los avances de efectivo no están activos en esta empresa (Configuración → Punto de venta)", 403);
  }
}

async function exigirPermiso(req, transaction) {
  if (req?.is_superuser) return;
  const perms = await permisosVigentes(req, transaction);
  if (!perms?.all && !hasPermission(perms, "sales.advance")) {
    throw fail("Tu usuario no tiene permiso para dar avances de efectivo", 403);
  }
}

// Tasa del sistema de la moneda de una caja: los dos tramos se convierten a base con la suya,
// así monto × tasa devuelve los billetes (o bolívares del punto) que de verdad se movieron.
async function tasaDe(journal, transaction) {
  const cur = journal?.currency_id ? await Currency.findByPk(journal.currency_id, { transaction }) : null;
  return { rate: (!cur || cur.is_base) ? 1 : (parseFloat(cur.exchange_rate) || 1), currency_id: cur?.id ?? null };
}

/**
 * Registra el avance dentro de la transacción `t` (la de un cobro, o la propia de crearAvance).
 *
 * `cash_amount`: el efectivo que se entrega, en la moneda de la caja de efectivo.
 * `fee_pct`: la comisión, en % sobre lo entregado, cobrada encima.
 * `in_journal_id` / `in_method`: por dónde entra (punto, pago móvil…); nunca una caja de efectivo.
 */
async function registrarAvance(data, req, t) {
  const {
    cash_amount, fee_pct = 0, cash_journal_id, in_journal_id, in_method, reference,
    customer_id = null, sale_id = null, payment_id = null, warehouse_id, employee_id, reference_date,
  } = data;

  const efectivo = round2(cash_amount);
  const pct = parseFloat(fee_pct) || 0;
  if (!(efectivo > 0)) throw fail("Indica cuánto efectivo se entrega");
  if (pct < 0 || pct > 100) throw fail("La comisión tiene que estar entre 0 y 100 %");
  if (!warehouse_id) throw fail("Falta la sucursal del avance");
  if (!cash_journal_id) throw fail("Indica de qué caja sale el efectivo");
  if (!in_journal_id) throw fail("Indica por dónde paga el cliente");

  const companyId = req?.company_id ?? req?.employee?.company_id ?? null;
  await exigirActivo(companyId, t);
  await exigirPermiso(req, t);
  await assertWarehouseAccess(req, warehouse_id, { optional: true });
  await assertJournalsInWarehouse([cash_journal_id, in_journal_id], warehouse_id, t);

  const caja = await PaymentJournal.findByPk(cash_journal_id, { transaction: t });
  const cuenta = await PaymentJournal.findByPk(in_journal_id, { transaction: t });
  if (!caja || !cuenta) throw fail("Caja no encontrada", 404);
  if (caja.type !== "efectivo") throw fail("El efectivo tiene que salir de una caja de efectivo");
  if (cuenta.type === "efectivo") throw fail("El avance se paga por punto, pago móvil o transferencia, no en efectivo");

  // Saca billetes de la gaveta: tiene que haber un turno abierto que los vaya a cuadrar.
  const empleado = employee_id || req?.employee?.id || null;
  const turno = empleado
    ? await CashSession.findOne({ where: { employee_id: empleado, warehouse_id, status: "open" }, transaction: t })
    : null;
  if (!turno) throw fail("Abre el turno de caja para dar un avance de efectivo");

  // El avance se mide en la moneda de la caja que entrega; lo que entra se pasa a la moneda de
  // la cuenta que recibe (en la misma moneda, el mismo número). La comisión, sobre lo entregado.
  const salida = await tasaDe(caja, t);
  const entrada = await tasaDe(cuenta, t);
  const mismaMoneda = String(salida.currency_id) === String(entrada.currency_id);
  const avanceEntra = mismaMoneda ? efectivo : round2((efectivo / salida.rate) * entrada.rate);
  const comision = round2(avanceEntra * pct / 100);
  const total = round2(avanceEntra + comision);

  const metodoEntra = await resolveMethod(in_journal_id, in_method || null, "in", { transaction: t });
  const metodoSale = await resolveMethod(cash_journal_id, null, "out", { transaction: t });
  const fecha = toLocalDate(reference_date) || new Date();
  const ref = reference?.trim()?.slice(0, 50) || null;

  const avance = await CashAdvance.create({
    warehouse_id, employee_id: empleado, customer_id: customer_id || null, sale_id: sale_id || null,
    payment_id: payment_id || null,
    cash_amount: efectivo, cash_journal_id, fee_pct: pct,
    in_amount: total, fee_amount: comision, in_journal_id, in_method: metodoEntra, reference: ref,
    status: "activo",
  }, { transaction: t });

  const [catEgreso] = await ExpenseCategory.findOrCreate({ where: { name: AVANCE }, defaults: { name: AVANCE, active: true }, transaction: t });
  const [catAvance] = await IncomeCategory.findOrCreate({ where: { name: AVANCE }, defaults: { name: AVANCE, active: true }, transaction: t });
  const [catComision] = await IncomeCategory.findOrCreate({ where: { name: COMISION }, defaults: { name: COMISION, active: true }, transaction: t });

  const cliente = customer_id ? await Customer.findByPk(customer_id, { attributes: ["name"], transaction: t }) : null;
  // Con venta, la factura con la que pasó por el punto: quien revisa ingresos o el estado de
  // cuenta ve de dónde salió el resto del pase.
  const venta = sale_id ? await Sale.findByPk(sale_id, { attributes: ["id", "invoice_number"], transaction: t }) : null;
  const conVenta = venta ? ` (con ${venta.invoice_number || `venta #${venta.id}`})` : "";
  const titulo = `Avance de efectivo #${avance.id}${conVenta}${cliente?.name ? ` — ${cliente.name}` : ""}`;
  const comun = { employee_id: empleado, warehouse_id, cash_advance_id: avance.id, status: "activo", date: fecha };

  // Montos en base con 6 decimales y la tasa de su caja: × tasa da lo que se movió, al céntimo.
  await Expense.create({
    ...comun, description: titulo, amount: round6(efectivo / salida.rate), rate: salida.rate,
    currency_id: salida.currency_id, category_id: catEgreso.id,
    payment_journal_id: cash_journal_id, payment_method: metodoSale, reference: ref,
  }, { transaction: t });
  await Income.create({
    ...comun, description: titulo, amount: round6(avanceEntra / entrada.rate), rate: entrada.rate,
    currency_id: entrada.currency_id, category_id: catAvance.id,
    payment_journal_id: in_journal_id, payment_method: metodoEntra, reference: ref,
  }, { transaction: t });
  if (comision > 0) {
    await Income.create({
      ...comun, description: `Comisión — ${titulo}`, amount: round6(comision / entrada.rate), rate: entrada.rate,
      currency_id: entrada.currency_id, category_id: catComision.id,
      payment_journal_id: in_journal_id, payment_method: metodoEntra, reference: ref,
    }, { transaction: t });
  }

  return {
    id: avance.id, cash_amount: efectivo, fee_pct: pct, fee_amount: comision, in_amount: total,
    cash_journal: caja.name, in_journal: cuenta.name, created_at: avance.created_at,
  };
}

// Avance suelto, sin venta: su propia transacción.
async function crearAvance(body, req) {
  const t = await sequelize.transaction();
  try {
    const data = await registrarAvance({ ...body, employee_id: req?.employee?.id }, req, t);
    await t.commit();
    return data;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

// Anular uno de sus movimientos anula el avance entero: un egreso sin su ingreso dejaría la
// caja corta o el punto largo sin explicación.
async function anularAvance(cashAdvanceId, transaction) {
  if (!cashAdvanceId) return;
  await Income.update({ status: "anulado" }, { where: { cash_advance_id: cashAdvanceId }, transaction });
  await Expense.update({ status: "anulado" }, { where: { cash_advance_id: cashAdvanceId }, transaction });
  await CashAdvance.update({ status: "anulado" }, { where: { id: cashAdvanceId }, transaction });
}

module.exports = { registrarAvance, crearAvance, anularAvance, AVANCE, COMISION, SETTING_KEY };
