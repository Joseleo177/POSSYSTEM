'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductStock extends Model {
    static associate(models) {
      ProductStock.belongsTo(models.Warehouse, { foreignKey: 'warehouse_id' });
      ProductStock.belongsTo(models.Product, { foreignKey: 'product_id' });
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
      type: DataTypes.NUMERIC(10, 3),
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    tableName: 'product_stock',
    modelName: 'ProductStock',
    timestamps: false
  });
  return ProductStock;
};
