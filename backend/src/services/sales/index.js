const getAllSales = require("./getAllSales");
const getOneSale = require("./getOneSale");
const getSalesStats = require("./getSalesStats");
const createSale = require("./createSale");
const cancelSale = require("./cancelSale");
const updateSale = require("./updateSale");
const confirmCreditSale = require("./confirmCreditSale");
const acceptWebOrder = require("./acceptWebOrder");
const { forgiveSale, unforgiveSale } = require("./forgiveSale");
const { claimSale, releaseSale, annotateHolders } = require("./holdLock");

module.exports = {
  acceptWebOrder,
  forgiveSale,
  unforgiveSale,
  getAllSales,
  getOneSale,
  getSalesStats,
  createSale,
  cancelSale,
  updateSale,
  confirmCreditSale,
  claimSale,
  releaseSale,
  annotateHolders,
};
