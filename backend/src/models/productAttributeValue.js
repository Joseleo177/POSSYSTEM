'use strict';
const { Model } = require('sequelize');

// Valor de un atributo: "M", "L", "Negro", "38". `position` da el orden real (S, M, L, XL),
// que el alfabético rompería.
module.exports = (sequelize, DataTypes) => {
  class ProductAttributeValue extends Model {
    static associate(models) {}
  }
  ProductAttributeValue.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: true },
    attribute_id: { type: DataTypes.INTEGER, allowNull: false },
    value:        { type: DataTypes.STRING(40), allowNull: false },
    position:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    tableName: 'product_attribute_values',
    modelName: 'ProductAttributeValue',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return ProductAttributeValue;
};
