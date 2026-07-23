const { Payment, Sale, Return, sequelize } = require("./shared");

module.exports = async function removePayment(id) {
  const t = await sequelize.transaction();
  try {
    const payment = await Payment.findByPk(id, { transaction: t, lock: true });
    if (!payment) throw new Error("Pago no encontrado");

    const sale = await Sale.findByPk(payment.sale_id, { transaction: t, lock: true });
    if (!sale) throw new Error("Factura no encontrada");

    await payment.destroy({ transaction: t });

    const remainingPaid = parseFloat(await Payment.sum("amount", { where: { sale_id: sale.id }, transaction: t }) || 0);
    const totalReturned = parseFloat(await Return.sum("total", { where: { sale_id: sale.id }, transaction: t }) || 0);
    const saleTotal = parseFloat(sale.total);
    // Lo realmente pendiente de cobrar descuenta las devoluciones ya acreditadas, no solo lo pagado.
    const effectiveOwed = Math.max(0, saleTotal - totalReturned);
    let newStatus = sale.status;

    // 'anulado' y 'devuelto' son estados terminales fijados por otro flujo (anular / devolución
    // total); quitar un pago no debe revivir la factura a "pendiente" si ya no hay nada que cobrar.
    if (sale.status !== "anulado" && sale.status !== "devuelto") {
      if (effectiveOwed <= 0.01) newStatus = "pagado";
      else if (remainingPaid <= 0) newStatus = sale.invoice_number ? "pendiente" : "borrador";
      else if (remainingPaid >= effectiveOwed - 0.01) newStatus = "pagado";
      else newStatus = "parcial";

      await sale.update({ status: newStatus }, { transaction: t });
    }
    await t.commit();

    return { sale_status: newStatus };
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
