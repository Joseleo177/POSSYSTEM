const crypto = require("crypto");
const { PurchasePayment, Purchase, PaymentJournal, Currency, Employee, Expense, ExpenseCategory, Customer, sequelize } = require("../../models");
const { effectiveDueDate } = require("../purchases/payablesService");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { toLocalDate } = require("../../utils/localDate");
const { assertJournalsInWarehouse } = require("../../utils/journalWarehouse");

async function getPurchaseAmountPaid(purchase_id, t) {
  // Solo cuenta pagos cuyo Expense vinculado sigue activo (o no tiene Expense). Un pago
  // conjunto no tiene egreso propio: cuelga del de su lote (`purchase_batch:<batch_id>`).
  const [row] = await sequelize.query(
    `SELECT COALESCE(SUM(pp.amount), 0) AS total
       FROM purchase_payments pp
       LEFT JOIN expenses e ON e.reference = COALESCE('purchase_batch:' || pp.batch_id, 'purchase_payment:' || pp.id::text)
      WHERE pp.purchase_id = :purchase_id
        AND (e.status IS NULL OR e.status = 'activo')`,
    {
      replacements: { purchase_id },
      type: sequelize.QueryTypes.SELECT,
      ...(t ? { transaction: t } : {}),
    }
  );
  return parseFloat(row?.total || 0);
}

async function recalcPurchaseStatus(purchaseId, t) {
  const purchase = await Purchase.findByPk(purchaseId, { transaction: t, lock: t ? true : undefined });
  if (!purchase) return null;
  const paid  = await getPurchaseAmountPaid(purchase.id, t);
  const total = parseFloat(purchase.total);
  const newStatus = paid <= 0 ? "pendiente" : paid >= total - 0.001 ? "pagado" : "parcial";
  await purchase.update({ payment_status: newStatus }, { transaction: t });
  return newStatus;
}

async function getPayments(purchaseId, req) {
  // Los pagos son de la orden, y la orden es de una sucursal.
  const purchaseRow = await Purchase.findByPk(purchaseId, { attributes: ["id", "warehouse_id"] });
  if (purchaseRow) await assertWarehouseAccess(req, purchaseRow.warehouse_id, { optional: true });

  const payments = await PurchasePayment.findAll({
    where: { purchase_id: purchaseId },
    include: [
      { model: PaymentJournal, attributes: ["id", "name", "color", "currency_id"] },
      { model: Currency,       attributes: ["id", "code", "symbol"] },
      { model: Employee,       attributes: ["id", "full_name"] },
    ],
    order: [["created_at", "ASC"]],
  });

  const data = payments.map(p => {
    const j = p.toJSON();
    j.journal_name    = j.PaymentJournal?.name  ?? null;
    j.journal_color   = j.PaymentJournal?.color ?? null;
    j.currency_symbol = j.Currency?.symbol      ?? "Ref.";
    j.currency_code   = j.Currency?.code        ?? null;
    j.employee_name   = j.Employee?.full_name   ?? null;
    delete j.PaymentJournal; delete j.Currency; delete j.Employee;
    return j;
  });

  return { data };
}

async function createPayment(purchaseId, body, employeeId, companyId, req) {
  const { amount, currency_id, exchange_rate, payment_journal_id, reference_date, reference_number, notes } = body;

  const payAmt = parseFloat(amount);
  if (!payAmt || payAmt <= 0)            { const e = new Error("El monto debe ser mayor a 0"); e.status = 400; throw e; }
  if (!reference_date)                    { const e = new Error("La fecha de referencia es requerida"); e.status = 400; throw e; }

  const t = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(purchaseId, { transaction: t, lock: true });
    if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
    // Pagar a proveedor mueve dinero por cuenta de una sucursal concreta.
    await assertWarehouseAccess(req, purchase.warehouse_id, { optional: true });
    // El diario del pago tiene que ser compartido o de esa sucursal.
    if (payment_journal_id) await assertJournalsInWarehouse(payment_journal_id, purchase.warehouse_id, t);
    if (purchase.payment_status === "pagado") { const e = new Error("Esta compra ya fue pagada completamente"); e.status = 400; throw e; }

    const alreadyPaid    = await getPurchaseAmountPaid(purchase.id, t);
    const purchaseTotal  = parseFloat(purchase.total);
    const pendingBalance = purchaseTotal - alreadyPaid;
    // Amount credited toward the purchase balance (capped); expense records the full cash out
    const purchasePayAmt = Math.min(payAmt, pendingBalance);
    const totalPaidNow   = parseFloat((alreadyPaid + purchasePayAmt).toFixed(6));

    const payment = await PurchasePayment.create({
      purchase_id:        purchase.id,
      amount:             purchasePayAmt,
      currency_id:        currency_id || null,
      exchange_rate:      parseFloat(exchange_rate) || 1,
      payment_journal_id: payment_journal_id || null,
      employee_id:        employeeId || null,
      company_id:         companyId || null,
      reference_date,
      reference_number:   reference_number?.trim() || null,
      notes:              notes?.trim() || null,
    }, { transaction: t });

    const [supplierCat] = await ExpenseCategory.findOrCreate({
      where:    { name: "Pagos a Proveedores", company_id: companyId },
      defaults: { name: "Pagos a Proveedores", active: true, company_id: companyId },
      transaction: t,
    });

    const supplierName = purchase.supplier_name || "Proveedor";
    const purchaseRef  = reference_number?.trim() || `#${purchase.id}`;

    await Expense.create({
      reference:          `purchase_payment:${payment.id}`,
      description:        `Pago a proveedor — ${supplierName} (Compra #${purchase.id})`,
      amount:             payAmt,   // full cash paid out (may exceed purchase balance)
      currency_id:        currency_id || null,
      rate:               parseFloat(exchange_rate) || 1,
      category_id:        supplierCat.id,
      // La fecha del egreso es la del pago, no la del instante en que se grabó. Sin esto caía
      // a NULL y el estado de cuenta lo ordenaba por su created_at con hora, desalineado con
      // el resto de los movimientos, que van a la medianoche de su día.
      date:               toLocalDate(reference_date),
      payment_journal_id: payment_journal_id || null,
      employee_id:        employeeId || null,
      company_id:         companyId || null,
      // El egreso pertenece a la sucursal que recibió la compra.
      warehouse_id:       purchase.warehouse_id || null,
      notes:              `Ref: ${purchaseRef}${notes?.trim() ? ` · ${notes.trim()}` : ""}`,
      status:             "activo",
    }, { transaction: t });

    const newStatus = totalPaidNow >= purchaseTotal - 0.001 ? "pagado" : "parcial";
    await purchase.update({ payment_status: newStatus }, { transaction: t });
    await t.commit();

    const remaining = parseFloat((purchaseTotal - totalPaidNow).toFixed(6));
    return { data: payment, payment_status: newStatus, amount_paid: totalPaidNow, balance: remaining < 0 ? 0 : remaining };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * Pago conjunto: una sola transferencia al proveedor que salda varias compras.
 *
 * Adentro se registra un pago por compra —cada factura sabe cuánto de ella se saldó—, pero un
 * único egreso por el monto transferido, que es el movimiento que aparece en el banco. Los
 * pagos comparten `batch_id` y el egreso lleva `purchase_batch:<batch_id>`.
 *
 * Solo compras del mismo proveedor y de la misma sucursal: una transferencia va a un solo
 * beneficiario, y el egreso pertenece a una sola sucursal —repartirlo entre varias dejaría el
 * arqueo de cada una sin poder explicar su parte—.
 *
 * Se imputa de la que vence primero a la que vence último: se saldan completas mientras
 * alcance y la última queda con abono. Lo que exceda la suma de saldos queda en el egreso
 * (sale del banco igual), igual que en el pago de una compra suelta.
 */
async function createBulkPayment(body, employeeId, companyId, req) {
  const { purchase_ids, amount, currency_id, exchange_rate, payment_journal_id, reference_date, reference_number, notes } = body;

  const ids = [...new Set((purchase_ids || []).map(n => parseInt(n, 10)).filter(Number.isInteger))];
  const payAmt = parseFloat(amount);
  if (!ids.length)             { const e = new Error("Selecciona al menos una compra"); e.status = 400; throw e; }
  if (!payAmt || payAmt <= 0)  { const e = new Error("El monto debe ser mayor a 0"); e.status = 400; throw e; }
  if (!payment_journal_id)     { const e = new Error("Selecciona el diario de pago"); e.status = 400; throw e; }
  if (!reference_date)         { const e = new Error("La fecha de referencia es requerida"); e.status = 400; throw e; }

  const t = await sequelize.transaction();
  try {
    // Orden fijo al bloquear: dos pagos conjuntos simultáneos sobre las mismas compras no se
    // esperan mutuamente en cruz.
    const purchases = await Purchase.findAll({ where: { id: ids }, order: [["id", "ASC"]], transaction: t, lock: true });
    if (purchases.length !== ids.length) { const e = new Error("Alguna de las compras ya no existe"); e.status = 404; throw e; }

    const first = purchases[0];
    // La empresa es la de las compras: la sesión de un superusuario no trae una propia.
    const cid   = companyId || first.company_id || null;
    const supplierKey = p => p.supplier_id ? `id:${p.supplier_id}` : `name:${p.supplier_name || ""}`;
    if (purchases.some(p => supplierKey(p) !== supplierKey(first))) {
      const e = new Error("Un pago conjunto es a un solo proveedor: selecciona compras del mismo"); e.status = 400; throw e;
    }
    if (purchases.some(p => (p.warehouse_id || null) !== (first.warehouse_id || null))) {
      const e = new Error("Las compras son de sucursales distintas: págalas por separado"); e.status = 400; throw e;
    }
    if (purchases.some(p => p.status === "borrador")) {
      const e = new Error("Una orden en borrador no se puede pagar: confírmala primero"); e.status = 400; throw e;
    }
    await assertWarehouseAccess(req, first.warehouse_id, { optional: true });
    await assertJournalsInWarehouse(payment_journal_id, first.warehouse_id, t);

    const supplier = first.supplier_id
      ? await Customer.findByPk(first.supplier_id, { attributes: ["credit_days"], transaction: t })
      : null;

    // Saldo de cada una y orden de imputación: la que vence primero, y a igual vencimiento
    // la más vieja.
    const pendientes = [];
    for (const p of purchases) {
      const paid    = await getPurchaseAmountPaid(p.id, t);
      const balance = parseFloat((parseFloat(p.total) - paid).toFixed(6));
      if (balance > 0.001) pendientes.push({ purchase: p, paid, balance, due: effectiveDueDate(p, supplier?.credit_days) });
    }
    if (!pendientes.length) { const e = new Error("Las compras seleccionadas ya están pagadas"); e.status = 400; throw e; }
    pendientes.sort((a, b) => a.due.localeCompare(b.due) || a.purchase.id - b.purchase.id);

    // Sin guiones: expenses.reference es VARCHAR(50) y "purchase_batch:" + un UUID con guiones
    // son 51 caracteres.
    const batchId = crypto.randomUUID().replace(/-/g, "");
    const rate    = parseFloat(exchange_rate) || 1;
    let restante  = payAmt;
    const applied = [];

    for (const item of pendientes) {
      if (restante <= 0.001) break;
      const abono = parseFloat(Math.min(restante, item.balance).toFixed(6));
      restante = parseFloat((restante - abono).toFixed(6));

      const payment = await PurchasePayment.create({
        purchase_id:        item.purchase.id,
        amount:             abono,
        currency_id:        currency_id || null,
        exchange_rate:      rate,
        payment_journal_id: payment_journal_id,
        employee_id:        employeeId || null,
        company_id:         cid,
        reference_date,
        reference_number:   reference_number?.trim() || null,
        notes:              notes?.trim() || null,
        batch_id:           batchId,
      }, { transaction: t });

      const total     = parseFloat(item.purchase.total);
      const newStatus = item.paid + abono >= total - 0.001 ? "pagado" : "parcial";
      await item.purchase.update({ payment_status: newStatus }, { transaction: t });
      applied.push({ purchase_id: item.purchase.id, payment_id: payment.id, amount: abono, payment_status: newStatus });
    }

    const [supplierCat] = await ExpenseCategory.findOrCreate({
      where:    { name: "Pagos a Proveedores", company_id: cid },
      defaults: { name: "Pagos a Proveedores", active: true, company_id: cid },
      transaction: t,
    });

    const supplierName = first.supplier_name || "Proveedor";
    const compras      = applied.map(a => `#${a.purchase_id}`).join(", ");
    const ref          = reference_number?.trim();

    await Expense.create({
      reference:          `purchase_batch:${batchId}`,
      description:        `Pago a proveedor — ${supplierName} (Compras ${compras})`,
      amount:             payAmt,   // lo transferido completo, aunque exceda la suma de saldos
      currency_id:        currency_id || null,
      rate,
      category_id:        supplierCat.id,
      date:               toLocalDate(reference_date),
      payment_journal_id: payment_journal_id,
      employee_id:        employeeId || null,
      company_id:         cid,
      warehouse_id:       first.warehouse_id || null,
      notes:              [ref ? `Ref: ${ref}` : null, "Pago conjunto", notes?.trim() || null].filter(Boolean).join(" · "),
      status:             "activo",
    }, { transaction: t });

    await t.commit();
    return {
      data: {
        batch_id: batchId,
        applied,
        total_applied: parseFloat(applied.reduce((acc, a) => acc + a.amount, 0).toFixed(6)),
        leftover: restante > 0.001 ? restante : 0,
      },
    };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// Recalcula todas las compras de un lote (tras anular o borrar su egreso).
async function recalcBatch(batchId, t) {
  const pagos = await PurchasePayment.findAll({ where: { batch_id: batchId }, attributes: ["purchase_id"], transaction: t });
  for (const purchaseId of new Set(pagos.map(p => p.purchase_id))) {
    await recalcPurchaseStatus(purchaseId, t);
  }
}

async function removePayment(paymentId, req) {
  const t = await sequelize.transaction();
  try {
    const payment = await PurchasePayment.findByPk(paymentId, { transaction: t, lock: true });
    if (!payment) { const e = new Error("Pago no encontrado"); e.status = 404; throw e; }

    // Un pago conjunto se deshace entero: del banco salió UNA transferencia y su egreso cubre
    // a todas las compras del lote. Quitar solo una parte dejaría ese egreso por un monto que
    // ya no explica nada.
    if (payment.batch_id) {
      const lote = await PurchasePayment.findAll({ where: { batch_id: payment.batch_id }, transaction: t, lock: true });
      const compras = await Purchase.findAll({ where: { id: [...new Set(lote.map(p => p.purchase_id))] }, transaction: t, lock: true });
      for (const c of compras) await assertWarehouseAccess(req, c.warehouse_id, { optional: true });

      await Expense.destroy({ where: { reference: `purchase_batch:${payment.batch_id}` }, transaction: t });
      await PurchasePayment.destroy({ where: { batch_id: payment.batch_id }, transaction: t });
      for (const c of compras) await recalcPurchaseStatus(c.id, t);
      await t.commit();

      const actual = await Purchase.findByPk(payment.purchase_id, { attributes: ["payment_status"] });
      return {
        message: compras.length > 1 ? `Pago conjunto anulado (${compras.length} compras)` : "Pago eliminado",
        payment_status: actual?.payment_status,
      };
    }

    const purchase = await Purchase.findByPk(payment.purchase_id, { transaction: t, lock: true });
    if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
    await assertWarehouseAccess(req, purchase.warehouse_id, { optional: true });

    await Expense.destroy({ where: { reference: `purchase_payment:${payment.id}` }, transaction: t });
    await payment.destroy({ transaction: t });

    const remaining = await getPurchaseAmountPaid(purchase.id, t);
    const total     = parseFloat(purchase.total);
    const newStatus = remaining <= 0 ? "pendiente" : remaining >= total - 0.001 ? "pagado" : "parcial";
    await purchase.update({ payment_status: newStatus }, { transaction: t });
    await t.commit();

    return { message: "Pago eliminado", payment_status: newStatus };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

module.exports = { getPayments, createPayment, createBulkPayment, removePayment, recalcPurchaseStatus, recalcBatch };
