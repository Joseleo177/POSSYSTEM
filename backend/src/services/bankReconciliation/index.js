'use strict';

// Conciliación bancaria: extractos subidos y casados con cobros, ingresos y egresos.
// Ver la migración 20261006100000-bank-reconciliation para el modelo de datos.
const { listAccounts } = require("./accounts");
const { create, list, getOne, auto, remove } = require("./statements");
const { candidates, match, register, registerCharges, ignore, unmatch } = require("./actions");

module.exports = {
  listAccounts, create, list, getOne, auto, remove,
  candidates, match, register, registerCharges, ignore, unmatch,
};
