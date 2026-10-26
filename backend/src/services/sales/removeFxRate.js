const { Sale, sequelize } = require("../../models");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { quitarTasaDivisas } = require("./fxRate");
const getOneSale = require("./getOneSale");

// Quita la tasa de divisas a una venta de contado que al final se paga toda en bolívares: vuelve
// a precio normal y se cobra como cualquier otra. Es lo mismo que pasa al dejarla a crédito
// (confirmCreditSale), pero sin emitirla: la caja la sigue cobrando en el acto.
//
// Solo sobre un borrador: todavía no tiene número fiscal ni cobros, así que cambiarle el total
// no altera ningún documento emitido. Una factura ya numerada no se toca (ver fxRate.js).
module.exports = async function removeFxRate(saleId, req) {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) throw Object.assign(new Error("Venta no encontrada"), { status: 404 });
    await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });
    if (sale.status !== "borrador" || sale.invoice_number) {
      throw Object.assign(new Error("Solo se le quita la tasa a una venta que aún no se ha cobrado ni emitido"), { status: 400 });
    }
    if (!(await quitarTasaDivisas(sale, t))) {
      throw Object.assign(new Error("Esta venta no tiene tasa de divisas"), { status: 400 });
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
  return getOneSale(saleId, req);
};
