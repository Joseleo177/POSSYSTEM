const { Payment, Sale, Return, Sequelize, sequelize, Op } = require("./shared");
const { resolveSaleStatus } = require("../../utils/saleBalance");

/**
 * Elimina de una vez todos los cobros de un mismo lote.
 *
 * Un cobro conjunto entró como un solo movimiento de dinero: borrar una de sus partes dejaría
 * media caja cuadrada y media no, con facturas saldadas por un pago que ya no existe. Se
 * deshace entero o no se deshace.
 *
 * Cada factura recupera el estado que le corresponda por lo que quede cobrado en ella.
 */
module.exports = async function removeBatchPayment(batchId) {
  const clave = String(batchId || "").trim();
  if (!clave) {
    throw Object.assign(new Error("Lote no indicado"), { status: 400, isOperational: true });
  }

  const t = await sequelize.transaction();
  try {
    const pagos = await Payment.findAll({ where: { batch_id: clave }, transaction: t, lock: true });
    if (!pagos.length) {
      throw Object.assign(new Error("Cobro no encontrado"), { status: 404, isOperational: true });
    }

    const saleIds = [...new Set(pagos.map(p => p.sale_id))];
    await Payment.destroy({ where: { batch_id: clave }, transaction: t });

    const estados = [];
    for (const saleId of saleIds) {
      const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
      if (!sale) continue;

      const cobrado = parseFloat(await Payment.sum("amount", { where: { sale_id: saleId }, transaction: t }) || 0);
      const devuelto = parseFloat(await Return.sum("total", {
        where: { sale_id: saleId, status: { [Op.ne]: "anulado" } },
        transaction: t,
      }) || 0);

      // 'anulado' y 'devuelto' los fija otro flujo: quitar un cobro no revive esas facturas.
      if (sale.status === "anulado" || sale.status === "devuelto") {
        estados.push({ sale_id: saleId, sale_status: sale.status });
        continue;
      }

      const nuevoEstado = resolveSaleStatus({
        saleTotal: sale.total,
        paid: cobrado,
        returned: devuelto,
        forgiven: sale.forgiven_amount,
        hasInvoice: !!sale.invoice_number,
      });
      await sale.update({ status: nuevoEstado }, { transaction: t });
      estados.push({ sale_id: saleId, sale_status: nuevoEstado });
    }

    await t.commit();
    return { removed: pagos.length, sales: estados };
  } catch (e) {
    await t.rollback();
    throw e;
  }
};
