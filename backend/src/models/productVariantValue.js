'use strict';
const { Model } = require('sequelize');

// Qué valor tiene la variante en cada atributo: un valor por atributo (PK compuesta).
module.exports = (sequelize, DataTypes) => {
  class ProductVariantValue extends Model {
    static associate(models) {}
  }
  ProductVariantValue.init({
    product_id:         { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    attribute_id:       { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    attribute_value_id: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    sequelize,
    tableName: 'product_variant_values',
    modelName: 'ProductVariantValue',
    timestamps: false,
  });
  return ProductVariantValue;
};
