const { Payment, Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Sequelize, sequelize } = require("../../models");
const { Op } = Sequelize;

async function getSaleBalance(saleId, transaction) {
  const paid = parseFloat(await Payment.sum("amount", { where: { sale_id: saleId }, transaction }) || 0);
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
