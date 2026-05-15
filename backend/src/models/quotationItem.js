'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class QuotationItem extends Model {
    static associate(models) {}
  }
  QuotationItem.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    quotation_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id:   { type: DataTypes.INTEGER, allowNull: true },
    product_name: { type: DataTypes.STRING(255), allowNull: false },
    quantity:     { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    price:        { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    subtotal:     { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  }, {
    sequelize,
    tableName: 'quotation_items',
    modelName: 'QuotationItem',
    underscored: true,
    timestamps: false,
  });
  return QuotationItem;
};
