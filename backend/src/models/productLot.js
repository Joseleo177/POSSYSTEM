'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductLot extends Model {
    static associate(models) {
        ProductLot.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
        ProductLot.belongsTo(models.Warehouse, { foreignKey: 'warehouse_id', as: 'warehouse' });
    }
  }
  ProductLot.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    product_id: { type: DataTypes.INTEGER, allowNull: false },
    warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
    lot_number: { type: DataTypes.STRING(100), allowNull: false },
    expiration_date: { type: DataTypes.DATEONLY, allowNull: false },
    qty: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 }
  }, {
    sequelize,
    tableName: 'product_lots',
    modelName: 'ProductLot',
    timestamps: true,
    underscored: true
  });
  return ProductLot;
};
