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
  CashSession,
  CashSessionJournal,
  Return,
  ReturnItem,
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
    include: [
      { model: Product, attributes: ["id", "name"] },
      {
        model: ReturnItem, attributes: ["qty"], required: false,
        // Las líneas de una NC anulada no cuentan como devueltas: si contaran, esas
        // unidades quedarían bloqueadas para siempre en el modal de devolución.
        include: [{ model: Return, attributes: [], required: true, where: { status: { [Op.ne]: "anulado" } } }],
      }
    ]
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
