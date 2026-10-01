'use strict';
const { Model } = require('sequelize');

// Tipo de variante por empresa: "Talla", "Color", "Talla calzado". Está en tenantModels
// (models/index.js), así que el filtro por empresa lo aplican los hooks.
module.exports = (sequelize, DataTypes) => {
  class ProductAttribute extends Model {
    static associate(models) {}
  }
  ProductAttribute.init({
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    name:       { type: DataTypes.STRING(40), allowNull: false },
    position:   { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    tableName: 'product_attributes',
    modelName: 'ProductAttribute',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return ProductAttribute;
};
