'use strict';
const { Model } = require('sequelize');

// Pueblo o zona de cobranza (ver migración 20261109100000-cobranza-sectores). Su sucursal da la
// mercancía, la serie y las cajas; quién lo trabaja va en cobranza_sector_employees.
module.exports = (sequelize, DataTypes) => {
  class CobranzaSector extends Model {
    static associate(models) {}
  }
  CobranzaSector.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // La llena el hook de empresa al crear (models/index.js); en la base es NOT NULL.
    company_id:   { type: DataTypes.INTEGER, allowNull: true },
    warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
    name:         { type: DataTypes.STRING(80), allowNull: false },
    notes:        { type: DataTypes.TEXT, allowNull: true },
    active:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'cobranza_sectors',
    modelName: 'CobranzaSector',
    timestamps: false,
  });
  return CobranzaSector;
};
