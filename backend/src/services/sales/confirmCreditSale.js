const { Sale, sequelize } = require("../../models");
const assignInvoiceNumber = require("./assignInvoiceNumber");

// Confirma una venta entregada a crédito: le asigna su correlativo fiscal y la deja en
// 'pendiente' (por cobrar), sin registrar ningún pago.
//
// Antes no existía forma de hacer esto: el correlativo solo se asignaba al cobrar, así
// que una venta fiada se quedaba en 'borrador' para siempre. Eso rompía varios reportes
// que asumen que una deuda real está en 'pendiente':
//   - salesReport cuenta pending_count/pending_amount solo con ('pendiente','parcial')
//   - getSessionSummary suma total_pending solo con status = 'pendiente'
// Es decir, lo fiado no aparecía ni en el reporte de ventas ni en el cierre de caja.
module.exports = async function confirmCreditSale(saleId) {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) { const e = new Error("Venta no encontrada"); e.status = 404; throw e; }

    // Solo tiene sentido sobre lo que aún no se ha facturado. Una venta ya pendiente,
    // parcial o pagada no debe volver a consumir un número de la serie.
    if (!["borrador", "espera"].includes(sale.status)) {
      const e = new Error(`Esta venta ya fue confirmada (estado: ${sale.status})`);
      e.status = 400;
      throw e;
    }
    if (!sale.customer_id) {
      const e = new Error("Una venta a crédito requiere un cliente identificado");
      e.status = 400;
      throw e;
    }

    await assignInvoiceNumber(sale, t);
    await sale.update({ status: "pendiente" }, { transaction: t });

    await t.commit();
    return { data: { id: sale.id, status: "pendiente", invoice_number: sale.invoice_number } };
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
