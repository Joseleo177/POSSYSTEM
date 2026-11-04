'use strict';
const { Model } = require('sequelize');

// Ausencia de un recurso (vacaciones, diligencia, bahía en mantenimiento). Ver migración
// 20261107100000-agenda.
module.exports = (sequelize, DataTypes) => {
  class AgendaBlock extends Model {}
  AgendaBlock.init({
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:  { type: DataTypes.INTEGER, allowNull: true },
    resource_id: { type: DataTypes.INTEGER, allowNull: false },
    starts_at:   { type: DataTypes.DATE, allowNull: false },
    ends_at:     { type: DataTypes.DATE, allowNull: false },
    reason:      { type: DataTypes.STRING(120), allowNull: true },
    created_at:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'agenda_blocks',
    modelName: 'AgendaBlock',
    timestamps: false,
  });
  return AgendaBlock;
};
