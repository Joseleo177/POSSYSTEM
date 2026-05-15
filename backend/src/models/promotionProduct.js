'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PromotionProduct extends Model {
    static associate(models) {}
  }
  PromotionProduct.init({
    promotion_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    product_id:   { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
  }, {
    sequelize,
    tableName: 'promotion_products',
    modelName: 'PromotionProduct',
    timestamps: false,
  });
  return PromotionProduct;
};
