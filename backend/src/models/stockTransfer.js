'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockTransfer extends Model {
    static associate(models) {
      // Associations are managed in models/index.js
    }
  }
  StockTransfer.init({
    from_warehouse_id: DataTypes.INTEGER,
    to_warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    product_id: DataTypes.INTEGER,
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    product_name: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    qty: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false
    },
    note: DataTypes.TEXT,
    employee_id: DataTypes.INTEGER
  }, {
    sequelize,
    tableName: 'stock_transfers',
    modelName: 'StockTransfer',
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false
  });
  return StockTransfer;
};
