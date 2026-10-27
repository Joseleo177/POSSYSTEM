'use strict';
const { Model } = require('sequelize');

// Área del restaurante (Salón, Terraza, Barra) dentro de una sucursal. Ver migración
// 20261031110000-mesas.
module.exports = (sequelize, DataTypes) => {
  class DiningArea extends Model {}
  DiningArea.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: true },
    warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
    name:         { type: DataTypes.STRING(60), allowNull: false },
    sort_order:   { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    active:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'dining_areas',
    modelName: 'DiningArea',
    timestamps: false,
  });
  return DiningArea;
};
