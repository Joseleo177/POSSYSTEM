const { PurchasePayment, Purchase, PaymentJournal, Currency, Employee, Expense, ExpenseCategory, sequelize } = require("../../models");

async function getPurchaseAmountPaid(purchase_id, t) {
  const result = await PurchasePayment.sum("amount", {
    where: { purchase_id },
    ...(t ? { transaction: t } : {}),
  });
  return parseFloat(result || 0);
}

async function getPayments(purchaseId) {
  const payments = await PurchasePayment.findAll({
    where: { purchase_id: purchaseId },
    include: [
      { model: PaymentJournal, attributes: ["id", "name", "color", "currency_id"] },
      { model: Currency,       attributes: ["id", "code", "symbol", "exchange_rate"] },
      { model: Employee,       attributes: ["id", "full_name"] },
    ],
    order: [["created_at", "ASC"]],
  });

  const data = payments.map(p => {
    const j = p.toJSON();
    j.journal_name    = j.PaymentJournal?.name  ?? null;
    j.journal_color   = j.PaymentJournal?.color ?? null;
    j.currency_symbol = j.Currency?.symbol      ?? "$";
    j.currency_code   = j.Currency?.code        ?? null;
    j.employee_name   = j.Employee?.full_name   ?? null;
    delete j.PaymentJournal; delete j.Currency; delete j.Employee;
    return j;
  });

  return { data };
}

async function createPayment(purchaseId, body, employeeId) {
  const { amount, currency_id, exchange_rate, payment_journal_id, reference_date, reference_number, notes } = body;

  const payAmt = parseFloat(amount);
  if (!payAmt || payAmt <= 0)            { const e = new Error("El monto debe ser mayor a 0"); e.status = 400; throw e; }
  if (!reference_date)                    { const e = new Error("La fecha de referencia es requerida"); e.status = 400; throw e; }
  if (!reference_number?.trim())          { const e = new Error("El número de referencia es requerido"); e.status = 400; throw e; }

  const t = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(purchaseId, { transaction: t, lock: true });
    if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
    if (purchase.payment_status === "pagado") { const e = new Error("Esta compra ya fue pagada completamente"); e.status = 400; throw e; }

    const alreadyPaid    = await getPurchaseAmountPaid(purchase.id, t);
    const totalPaidNow   = parseFloat((alreadyPaid + payAmt).toFixed(2));
    const purchaseTotal  = parseFloat(purchase.total);

    if (totalPaidNow > purchaseTotal + 0.001) {
      const e = new Error(`El monto excede el saldo pendiente. Saldo: ${(purchaseTotal - alreadyPaid).toFixed(2)}`);
      e.status = 400; throw e;
    }

    const payment = await PurchasePayment.create({
      purchase_id:        purchase.id,
      amount:             payAmt,
      currency_id:        currency_id || null,
      exchange_rate:      parseFloat(exchange_rate) || 1,
      payment_journal_id: payment_journal_id || null,
      employee_id:        employeeId || null,
      reference_date,
      reference_number:   reference_number?.trim() || null,
      notes:              notes?.trim() || null,
    }, { transaction: t });

    const [supplierCat] = await ExpenseCategory.findOrCreate({
      where:    { name: "Pagos a Proveedores" },
      defaults: { name: "Pagos a Proveedores", active: true },
      transaction: t,
    });

    const supplierName = purchase.supplier_name || "Proveedor";
    const purchaseRef  = reference_number?.trim() || `#${purchase.id}`;

    await Expense.create({
      reference:          `purchase_payment:${payment.id}`,
      description:        `Pago a proveedor — ${supplierName} (Compra #${purchase.id})`,
      amount:             payAmt,
      currency_id:        currency_id || null,
      rate:               parseFloat(exchange_rate) || 1,
      category_id:        supplierCat.id,
      payment_journal_id: payment_journal_id || null,
      employee_id:        employeeId || 1,
      notes:              `Ref: ${purchaseRef}${notes?.trim() ? ` · ${notes.trim()}` : ""}`,
      status:             "activo",
    }, { transaction: t });

    const newStatus = totalPaidNow >= purchaseTotal - 0.001 ? "pagado" : "parcial";
    await purchase.update({ payment_status: newStatus }, { transaction: t });
    await t.commit();

    const balance = parseFloat((purchaseTotal - totalPaidNow).toFixed(2));
    return { data: payment, payment_status: newStatus, amount_paid: totalPaidNow, balance: balance < 0 ? 0 : balance };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function removePayment(paymentId) {
  const t = await sequelize.transaction();
  try {
    const payment = await PurchasePayment.findByPk(paymentId, { transaction: t, lock: true });
    if (!payment) { const e = new Error("Pago no encontrado"); e.status = 404; throw e; }

    const purchase = await Purchase.findByPk(payment.purchase_id, { transaction: t, lock: true });
    if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }

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

module.exports = { getPayments, createPayment, removePayment };
