const { Payment, Sale, Sequelize } = require("./shared");

module.exports = async function getPaymentsStats() {
  const [pendingCount, parcialCount, paidCount, paymentStats] = await Promise.all([
    Sale.count({ where: { status: "pendiente" } }),
    Sale.count({ where: { status: "parcial" } }),
    Sale.count({ where: { status: "pagado" } }),
    Payment.findOne({
      attributes: [
        [Sequelize.fn("COUNT", Sequelize.col("id")), "total_payments"],
        [Sequelize.fn("SUM", Sequelize.col("amount")), "total_amount"],
        [Sequelize.literal('COUNT(CASE WHEN "Payment"."created_at" >= CURRENT_DATE THEN 1 END)'), "payments_today"],
        [
          Sequelize.literal('COALESCE(SUM(CASE WHEN "Payment"."created_at" >= CURRENT_DATE THEN amount ELSE 0 END), 0)'),
          "amount_today",
        ],
      ],
      raw: true,
    }),
  ]);

  return {
    pending_invoices: pendingCount,
    parcial_invoices: parcialCount,
    paid_invoices: paidCount,
    total_payments: parseInt(paymentStats?.total_payments || 0, 10),
    total_amount: parseFloat(paymentStats?.total_amount || 0),
    payments_today: parseInt(paymentStats?.payments_today || 0, 10),
    amount_today: parseFloat(paymentStats?.amount_today || 0),
  };
};
