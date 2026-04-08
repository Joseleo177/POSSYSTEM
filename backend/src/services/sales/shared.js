const {
  Sale,
  SaleItem,
  Customer,
  Employee,
  Currency,
  Warehouse,
  Product,
  ProductStock,
  Serie,
  SerieRange,
  ProductComboItem,
  Sequelize,
  sequelize,
} = require("../../models");

const { Op } = Sequelize;
const PAYMENT_METHODS = ["efectivo", "transferencia", "pago_movil", "zelle", "punto_venta"];

const SALE_INCLUDE = [
  { model: Customer, attributes: ["id", "name", "rif", "address", "phone"], required: false },
  { model: Employee, attributes: ["id", "full_name"], required: false },
  { model: Currency, attributes: ["id", "symbol", "code"], required: false },
  { model: Warehouse, attributes: ["id", "name"], required: false },
  { model: Serie, attributes: ["id", "name", "prefix"], required: false },
  { 
    model: SaleItem, 
    include: [{ model: Product, attributes: ["id", "name"] }] 
  }
];

module.exports = {
  Sale,
  SaleItem,
  Customer,
  Employee,
  Currency,
  Warehouse,
  Product,
  ProductStock,
  Serie,
  SerieRange,
  ProductComboItem,
  Sequelize,
  sequelize,
  Op,
  PAYMENT_METHODS,
  SALE_INCLUDE,
};
