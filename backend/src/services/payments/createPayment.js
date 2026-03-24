const { Payment, Sale, sequelize, getSaleBalance } = require("./shared");

module.exports = async function createPayment(body) {
  const t = await sequelize.transaction();
  try {
    const {
      sale_id,
      amount,
      currency_id,
      exchange_rate,
      payment_journal_id,
      employee_id,
      reference_date,
      reference_number,
      notes,
    } = body;

    if (!sale_id) throw new Error("sale_id es requerido");
    if (!amount) throw new Error("El monto es requerido");
    if (!reference_date) throw new Error("La fecha de referencia es requerida");

    const sale = await Sale.findByPk(sale_id, { transaction: t, lock: true });
    if (!sale) throw new Error("Factura no encontrada");
    if (sale.status === "pagado") throw new Error("Esta factura ya fue pagada");
    if (sale.status === "anulado") throw new Error("Esta factura está anulada");

    const payAmt = parseFloat(amount);
    if (payAmt <= 0) throw new Error("El monto debe ser mayor a 0");

    const alreadyPaid = await getSaleBalance(sale_id, t);
    const totalPaidNow = parseFloat((alreadyPaid + payAmt).toFixed(2));
    const saleTotal = parseFloat(sale.total);

    if (totalPaidNow > saleTotal + 0.001) {
      throw new Error(`El monto excede el saldo pendiente. Saldo: ${(saleTotal - alreadyPaid).toFixed(2)}`);
    }

    const payment = await Payment.create(
      {
        sale_id,
        customer_id: sale.customer_id,
        amount: payAmt,
        currency_id: currency_id || sale.currency_id || null,
        exchange_rate: parseFloat(exchange_rate) || sale.exchange_rate || 1,
        payment_journal_id: payment_journal_id || sale.payment_journal_id || null,
        employee_id: employee_id || null,
        reference_date,
        reference_number: reference_number?.trim() || null,
        notes: notes?.trim() || null,
      },
      { transaction: t }
    );

    const newStatus = totalPaidNow >= saleTotal - 0.001 ? "pagado" : "parcial";
    await sale.update({ status: newStatus }, { transaction: t });
    await t.commit();

    const balance = parseFloat((saleTotal - totalPaidNow).toFixed(2));
    return {
      payment,
      sale_status: newStatus,
      amount_paid: totalPaidNow,
      balance: balance < 0 ? 0 : balance,
    };
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
