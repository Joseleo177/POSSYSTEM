const { Payment, Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Warehouse, Return, Sequelize, sequelize } = require("../../models");
const { Op } = Sequelize;

async function getSaleBalance(saleId, transaction) {
  const paid = parseFloat(await Payment.sum("amount", {
    where: { sale_id: saleId, amount: { [Op.gt]: 0 } },
    transaction,
  }) || 0);
  // Cuando el cambio viene de otro diario, el monto recibido (amount) incluye el exceso
  // físico del cliente. Restamos change_given para obtener el crédito real a la factura.
  const changeGiven = parseFloat(await Payment.sum("change_given", {
    where: { sale_id: saleId, change_journal_id: { [Op.not]: null } },
    transaction,
  }) || 0);
  // Crédito de cliente y saldo exonerado: se aplican directo sobre la venta y no generan un
  // Payment. Los dos saldan factura sin que entre dinero a caja, así que suman acá —donde se
  // calcula cuánto le queda por cobrar— pero nunca en los reportes que leen `payments`.
  const saleRecord = await Sale.findByPk(saleId, {
    attributes: ['credit_applied', 'forgiven_amount'],
    transaction,
  });
  const creditApplied = parseFloat(saleRecord?.credit_applied || 0);
  const forgiven = parseFloat(saleRecord?.forgiven_amount || 0);
  return paid - changeGiven + creditApplied + forgiven;
}

module.exports = {
  Payment,
  Sale,
  SaleItem,
  Customer,
  Employee,
  Currency,
  PaymentJournal,
  Warehouse,
  Return,
  Sequelize,
  sequelize,
  Op,
  getSaleBalance,
};
