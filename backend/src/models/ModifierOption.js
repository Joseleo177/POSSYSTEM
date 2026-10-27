'use strict';
const { Model } = require('sequelize');

// Opción de un grupo de adicionales. Sin product_id es solo texto (sin costo); con él, se cobra
// como línea aparte con ese producto. Ver migración 20261031130000-adicionales.
module.exports = (sequelize, DataTypes) => {
  class ModifierOption extends Model {}
  ModifierOption.init({
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    group_id:   { type: DataTypes.INTEGER, allowNull: false },
    name:       { type: DataTypes.STRING(60), allowNull: false },
    product_id: { type: DataTypes.INTEGER, allowNull: true },
    // Agotado a mano (se acabó el plátano de los tostones). Ver migración 20261031140000.
    sold_out:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    active:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'modifier_options',
    modelName: 'ModifierOption',
    timestamps: false,
  });
  return ModifierOption;
};
