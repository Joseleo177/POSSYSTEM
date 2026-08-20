const { Payment, Sale, Return, Sequelize, sequelize } = require("./shared");
const { resolveSaleStatus } = require("../../utils/saleBalance");

module.exports = async function removePayment(id) {
  const t = await sequelize.transaction();
  try {
    const payment = await Payment.findByPk(id, { transaction: t, lock: true });
    if (!payment) throw new Error("Pago no encontrado");

    const sale = await Sale.findByPk(payment.sale_id, { transaction: t, lock: true });
    if (!sale) throw new Error("Factura no encontrada");

    await payment.destroy({ transaction: t });

    const remainingPaid = parseFloat(await Payment.sum("amount", { where: { sale_id: sale.id }, transaction: t }) || 0);
    // Una NC anulada no descuenta nada: la factura vuelve a deberse completa.
    const totalReturned = parseFloat(await Return.sum("total", {
      where: { sale_id: sale.id, status: { [Sequelize.Op.ne]: "anulado" } },
      transaction: t,
    }) || 0);
    const saleTotal = parseFloat(sale.total);
    let newStatus = sale.status;

    // 'anulado' y 'devuelto' son estados terminales fijados por otro flujo (anular / devolución
    // total); quitar un pago no debe revivir la factura a "pendiente" si ya no hay nada que cobrar.
    if (sale.status !== "anulado" && sale.status !== "devuelto") {
      // Criterio compartido con cobrar y con anular una NC (ver utils/saleBalance): tolera el
      // desfase de redondeo entre el total en dólares y los subtotales precisos con que se
      // cobra en bolívares. Con el céntimo de margen anterior, quitarle un pago a una factura
      // saldada la dejaba 'parcial' debiendo una centésima inexistente.
      newStatus = resolveSaleStatus({
        saleTotal, paid: remainingPaid, returned: totalReturned, hasInvoice: !!sale.invoice_number,
      });
      await sale.update({ status: newStatus }, { transaction: t });
    }
    await t.commit();

    return { sale_status: newStatus };
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
