const { PurchasePayment, Purchase, PaymentJournal, Currency, Employee, Expense, ExpenseCategory, sequelize } = require("../models");

// Función interna: suma de pagos de una compra (dentro de una transacción opcional)
async function getPurchaseAmountPaid(purchase_id, t) {
  const result = await PurchasePayment.sum("amount", {
    where: { purchase_id },
    ...(t ? { transaction: t } : {}),
  });
  return parseFloat(result || 0);
}

// GET /api/purchases/:id/payments
const getPayments = async (req, res) => {
  try {
    const payments = await PurchasePayment.findAll({
      where: { purchase_id: req.params.id },
      include: [
        { model: PaymentJournal, attributes: ["id", "name", "color", "currency_id"] },
        { model: Currency,       attributes: ["id", "code", "symbol", "exchange_rate"] },
        { model: Employee,       attributes: ["id", "full_name"] },
      ],
      order: [["created_at", "ASC"]],
    });

    const data = payments.map(p => {
      const j = p.toJSON();
      j.journal_name    = j.PaymentJournal?.name    ?? null;
      j.journal_color   = j.PaymentJournal?.color   ?? null;
      j.currency_symbol = j.Currency?.symbol        ?? "$";
      j.currency_code   = j.Currency?.code          ?? null;
      j.employee_name   = j.Employee?.full_name      ?? null;
      delete j.PaymentJournal; delete j.Currency; delete j.Employee;
      return j;
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

// POST /api/purchases/:id/payments
const createPayment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(req.params.id, { transaction: t, lock: true });
    if (!purchase) throw new Error("Compra no encontrada");
    if (purchase.payment_status === "pagado") throw new Error("Esta compra ya fue pagada completamente");

    const { amount, currency_id, exchange_rate, payment_journal_id, reference_date, reference_number, notes } = req.body;

    const payAmt = parseFloat(amount);
    if (!payAmt || payAmt <= 0) throw new Error("El monto debe ser mayor a 0");
    if (!reference_date) throw new Error("La fecha de referencia es requerida");
    if (!reference_number?.trim()) throw new Error("El número de referencia es requerido");

    const alreadyPaid = await getPurchaseAmountPaid(purchase.id, t);
    const totalPaidNow = parseFloat((alreadyPaid + payAmt).toFixed(2));
    const purchaseTotal = parseFloat(purchase.total);

    if (totalPaidNow > purchaseTotal + 0.001) {
      throw new Error(`El monto excede el saldo pendiente. Saldo: ${(purchaseTotal - alreadyPaid).toFixed(2)}`);
    }

    const payment = await PurchasePayment.create({
      purchase_id:        purchase.id,
      amount:             payAmt,
      currency_id:        currency_id || null,
      exchange_rate:      parseFloat(exchange_rate) || 1,
      payment_journal_id: payment_journal_id || null,
      employee_id:        req.employee?.id || null,
      reference_date,
      reference_number:   reference_number?.trim() || null,
      notes:              notes?.trim() || null,
    }, { transaction: t });

    // Registrar como egreso en el diario (pago a proveedor = dinero que sale de caja)
    const [supplierCat] = await ExpenseCategory.findOrCreate({
      where: { name: "Pagos a Proveedores" },
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
      employee_id:        req.employee?.id || 1,
      notes:              `Ref: ${purchaseRef}${notes?.trim() ? ` · ${notes.trim()}` : ""}`,
      status:             "activo",
    }, { transaction: t });

    const newStatus = totalPaidNow >= purchaseTotal - 0.001 ? "pagado" : "parcial";
    await purchase.update({ payment_status: newStatus }, { transaction: t });
    await t.commit();

    const balance = parseFloat((purchaseTotal - totalPaidNow).toFixed(2));
    res.status(201).json({
      ok: true,
      data: payment,
      payment_status: newStatus,
      amount_paid: totalPaidNow,
      balance: balance < 0 ? 0 : balance,
    });
  } catch (err) {
    await t.rollback(); console.error('PAYMENT ERROR:', err);
    const status = /requerido|no encontrada|ya fue|excede|mayor/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

// DELETE /api/purchase-payments/:id
const removePayment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const payment = await PurchasePayment.findByPk(req.params.id, { transaction: t, lock: true });
    if (!payment) throw new Error("Pago no encontrado");

    const purchase = await Purchase.findByPk(payment.purchase_id, { transaction: t, lock: true });
    if (!purchase) throw new Error("Compra no encontrada");

    // Eliminar el egreso vinculado (si existe)
    await Expense.destroy({
      where: { reference: `purchase_payment:${payment.id}` },
      transaction: t,
    });

    await payment.destroy({ transaction: t });

    const remaining = await getPurchaseAmountPaid(purchase.id, t);
    const total = parseFloat(purchase.total);
    const newStatus = remaining <= 0 ? "pendiente" : remaining >= total - 0.001 ? "pagado" : "parcial";
    await purchase.update({ payment_status: newStatus }, { transaction: t });
    await t.commit();

    res.json({ ok: true, message: "Pago eliminado", payment_status: newStatus });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = { getPayments, createPayment, removePayment };
