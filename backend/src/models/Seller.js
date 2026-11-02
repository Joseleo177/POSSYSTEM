'use strict';
const { Model } = require('sequelize');

// Vendedor que gana comisión (ver migración 20261105100000-comisiones). No es un usuario: en la
// joyería que lo pidió, 8 de sus 10 vendedores no entran al sistema. employee_id lo enlaza a uno
// si lo tiene. `code` es el número corto que se teclea en la caja ("01", "07").
module.exports = (sequelize, DataTypes) => {
  class Seller extends Model {
    static associate(models) {}
  }
  Seller.init({
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // La llena el hook de empresa al crear (models/index.js); en la base es NOT NULL.
    company_id:     { type: DataTypes.INTEGER, allowNull: true },
    code:           { type: DataTypes.STRING(10), allowNull: false },
    name:           { type: DataTypes.STRING(120), allowNull: false },
    doc_id:         { type: DataTypes.STRING(20), allowNull: true },
    phone:          { type: DataTypes.STRING(30), allowNull: true },
    commission_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    // Sucursal donde trabaja. Nula = vende en todas. Solo ordena la lista de la caja.
    warehouse_id:   { type: DataTypes.INTEGER, allowNull: true },
    employee_id:    { type: DataTypes.INTEGER, allowNull: true },
    active:         { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'sellers',
    modelName: 'Seller',
    timestamps: false,
  });
  return Seller;
};
