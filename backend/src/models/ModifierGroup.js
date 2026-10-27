'use strict';
const { Model } = require('sequelize');

// Grupo de adicionales de un plato ("Término de la carne", "Extras"). min_select > 0 lo hace
// obligatorio; max_select NULL = sin tope. Ver migración 20261031130000-adicionales.
module.exports = (sequelize, DataTypes) => {
  class ModifierGroup extends Model {}
  ModifierGroup.init({
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    name:       { type: DataTypes.STRING(60), allowNull: false },
    min_select: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    max_select: { type: DataTypes.INTEGER, allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    active:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'modifier_groups',
    modelName: 'ModifierGroup',
    timestamps: false,
  });
  return ModifierGroup;
};
