const { Payment, Sale, sequelize } = require("./shared");

module.exports = async function removePayment(id) {
  const t = await sequelize.transaction();
  try {
    const payment = await Payment.findByPk(id, { transaction: t, lock: true });
    if (!payment) throw new Error("Pago no encontrado");

    const sale = await Sale.findByPk(payment.sale_id, { transaction: t, lock: true });
    if (!sale) throw new Error("Factura no encontrada");
    if (sale.status === "anulado") throw new Error("La factura está anulada");

    await payment.destroy({ transaction: t });

    const remainingPaid = parseFloat(await Payment.sum("amount", { where: { sale_id: sale.id }, transaction: t }) || 0);
    const saleTotal = parseFloat(sale.total);
    let newStatus;
    if (remainingPaid <= 0) newStatus = "pendiente";
    else if (remainingPaid >= saleTotal - 0.01) newStatus = "pagado";
    else newStatus = "parcial";

    await sale.update({ status: newStatus }, { transaction: t });
    await t.commit();

    return { sale_status: newStatus };
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
