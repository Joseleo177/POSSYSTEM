'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SaleItem extends Model {
    static associate(models) {}
  }
  SaleItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sale_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER },
    name: { type: DataTypes.STRING(200), allowNull: false },
    price: { type: DataTypes.DECIMAL(14, 5), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    discount: { type: DataTypes.DECIMAL(14, 5), allowNull: false, defaultValue: 0 },
    // Costo congelado al momento de la venta. Sin esto la utilidad histórica se
    // recalcularía con el costo actual. Null en ventas previas a la migración.
    cost_price: { type: DataTypes.DECIMAL(14, 5), allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(14, 5) },
    // Nota de ESTA línea ("sin cebolla"), para la comanda. Distinta de sales.web_note, que es
    // del pedido entero.
    note: { type: DataTypes.STRING(200), allowNull: true }
  }, {
    sequelize,
    tableName: 'sale_items',
    modelName: 'SaleItem',
    timestamps: false
  });
  return SaleItem;
};
