'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseItem extends Model {
    static associate(models) {}
  }
  PurchaseItem.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    purchase_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER },
    product_name: { type: DataTypes.STRING(200), allowNull: false },
    package_unit: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'unidad' },
    package_qty: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 1 },
    package_size: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 1 },
    package_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    unit_cost: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    profit_margin: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    sale_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    total_units: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    lot_number: { type: DataTypes.STRING(100), allowNull: true },
    expiration_date: { type: DataTypes.DATEONLY, allowNull: true }
  }, {
    sequelize,
    tableName: 'purchase_items',
    modelName: 'PurchaseItem',
    timestamps: false
  });
  return PurchaseItem;
};
