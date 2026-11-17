'use strict';
const { Model } = require('sequelize');

// Cada cambio de a quién le toca la propina de una factura (ver migración 20261121120000-propinas):
// de quién a quién (o del pozo / al pozo), quién lo hizo y por qué. Lo pide un permiso propio y
// vale aun con la factura cerrada.
module.exports = (sequelize, DataTypes) => {
  class TipReassignment extends Model {
    static associate() {}
  }
  TipReassignment.init({
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:     { type: DataTypes.INTEGER, allowNull: true },
    sale_id:        { type: DataTypes.INTEGER, allowNull: false },
    from_seller_id: { type: DataTypes.INTEGER, allowNull: true },
    to_seller_id:   { type: DataTypes.INTEGER, allowNull: true },
    from_pool:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    to_pool:        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reason:         { type: DataTypes.STRING(300), allowNull: true },
    employee_id:    { type: DataTypes.INTEGER, allowNull: true },
    created_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'tip_reassignments',
    modelName: 'TipReassignment',
    timestamps: false,
  });
  return TipReassignment;
};
