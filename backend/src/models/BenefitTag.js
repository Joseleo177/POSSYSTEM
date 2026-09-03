'use strict';
const { Model } = require('sequelize');

// Etiqueta de beneficio reusable para la ficha pública del producto ("Repara y fortalece",
// "Reduce el frizz"). Está en tenantModels (models/index.js), así que el filtro por empresa
// lo aplican los hooks — salvo en rutas con multer, donde no hay foto de por medio así que
// no aplica la salvedad de catalogBanners/categories.
module.exports = (sequelize, DataTypes) => {
  class BenefitTag extends Model {
    static associate(models) {}
  }
  BenefitTag.init({
    id:   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(60), allowNull: false },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    tableName: 'catalog_benefit_tags',
    modelName: 'BenefitTag',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return BenefitTag;
};
