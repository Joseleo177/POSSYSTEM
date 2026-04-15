'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductStock extends Model {
    static associate(models) {
      // Associations are managed in models/index.js
    }
  }
  ProductStock.init({
    warehouse_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: { model: 'warehouses', key: 'id' }
    },
    product_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: { model: 'products', key: 'id' }
    },
    qty: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 0
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'product_stock',
    modelName: 'ProductStock',
    timestamps: false
  });
  return ProductStock;
};
