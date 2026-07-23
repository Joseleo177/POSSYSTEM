const { Payment, Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Return, Sequelize, sequelize } = require("../../models");
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
  // Crédito de cliente aplicado directamente sobre la venta (no genera Payment record)
  const saleRecord = await Sale.findByPk(saleId, { attributes: ['credit_applied'], transaction });
  const creditApplied = parseFloat(saleRecord?.credit_applied || 0);
  return paid - changeGiven + creditApplied;
}

module.exports = {
  Payment,
  Sale,
  SaleItem,
  Customer,
  Employee,
  Currency,
  PaymentJournal,
  Return,
  Sequelize,
  sequelize,
  Op,
  getSaleBalance,
};
