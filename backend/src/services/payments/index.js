const getAllPayments = require("./getAllPayments");
const getPendingPayments = require("./getPendingPayments");
const getPaymentsStats = require("./getPaymentsStats");
const createPayment = require("./createPayment");
const createBulkPayment = require("./createBulkPayment");
const removePayment = require("./removePayment");
const removeBatchPayment = require("./removeBatchPayment");

module.exports = {
  getAllPayments,
  getPendingPayments,
  getPaymentsStats,
  createPayment,
  createBulkPayment,
  removePayment,
  removeBatchPayment,
};
