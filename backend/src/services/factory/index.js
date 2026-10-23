'use strict';

// Módulo Fábrica: láminas numeradas, retazos y órdenes de fabricación.
// Ver la migración 20261023100000-fabrica para el modelo de datos.
module.exports = {
  ...require("./pieces"),
  ...require("./orders"),
  ...require("./recipes"),
  ...require("./stages"),
};
