'use strict';
const { Model } = require('sequelize');

// Quién hace un servicio. Un servicio sin filas aquí (en esa sucursal) lo hacen todos los
// recursos de la sucursal.
// Ver migración 20261107100000-agenda.
module.exports = (sequelize, DataTypes) => {
  class AgendaResourceService extends Model {}
  AgendaResourceService.init({
    company_id:  { type: DataTypes.INTEGER, allowNull: true },
    resource_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    product_id:  { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
  }, {
    sequelize,
    tableName: 'agenda_resource_services',
    modelName: 'AgendaResourceService',
    timestamps: false,
  });
  return AgendaResourceService;
};
