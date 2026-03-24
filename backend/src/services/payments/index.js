const getAllPayments = require("./getAllPayments");
const getPendingPayments = require("./getPendingPayments");
const getPaymentsStats = require("./getPaymentsStats");
const createPayment = require("./createPayment");
const removePayment = require("./removePayment");

module.exports = {
  getAllPayments,
  getPendingPayments,
  getPaymentsStats,
  createPayment,
  removePayment,
};
