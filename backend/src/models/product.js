'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {}
  }
  Product.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    stock: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 },
    unit: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unidad' },
    qty_step: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 1.000 },
    category_id: { type: DataTypes.INTEGER },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    image_filename: { type: DataTypes.STRING(255) },
    cost_price: { type: DataTypes.DECIMAL(10, 2) },
    profit_margin: { type: DataTypes.DECIMAL(5, 2) },
    package_size: { type: DataTypes.DECIMAL(10, 3) },
    package_unit: { type: DataTypes.STRING(50) },
    is_combo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_service: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    min_stock: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 },
    barcode: { type: DataTypes.STRING(50), allowNull: true, unique: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'products',
    modelName: 'Product',
    timestamps: false
  });
  return Product;
};
