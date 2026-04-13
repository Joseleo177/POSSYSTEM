const { Payment, Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Sequelize, sequelize } = require("../../models");
const { Op } = Sequelize;

async function getSaleBalance(saleId, transaction) {
  // Solo suma pagos positivos (cobros reales); los egresos de cambio (amount < 0) no abonan a la factura
  const paid = parseFloat(await Payment.sum("amount", {
    where: { sale_id: saleId, amount: { [Op.gt]: 0 } },
    transaction,
  }) || 0);
  return paid;
}

module.exports = {
  Payment,
  Sale,
  SaleItem,
  Customer,
  Employee,
  Currency,
  PaymentJournal,
  Sequelize,
  sequelize,
  Op,
  getSaleBalance,
};
