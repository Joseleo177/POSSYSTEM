'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductBenefitTag extends Model {
    static associate(models) {}
  }
  ProductBenefitTag.init({
    product_id:     { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    benefit_tag_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
  }, {
    sequelize,
    tableName: 'product_benefit_tags',
    modelName: 'ProductBenefitTag',
    timestamps: false,
  });
  return ProductBenefitTag;
};
