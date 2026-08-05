const getAllSales = require("./getAllSales");
const getOneSale = require("./getOneSale");
const getSalesStats = require("./getSalesStats");
const createSale = require("./createSale");
const cancelSale = require("./cancelSale");
const updateSale = require("./updateSale");
const confirmCreditSale = require("./confirmCreditSale");
const acceptWebOrder = require("./acceptWebOrder");

module.exports = {
  acceptWebOrder,
  getAllSales,
  getOneSale,
  getSalesStats,
  createSale,
  cancelSale,
  updateSale,
  confirmCreditSale,
};
