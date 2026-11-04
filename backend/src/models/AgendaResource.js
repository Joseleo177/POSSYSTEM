'use strict';
const { Model } = require('sequelize');

// Lo que se agenda: una persona (barbero, médico) o un puesto con capacidad (bahía de lavado).
// Ver migración 20261107100000-agenda.
module.exports = (sequelize, DataTypes) => {
  class AgendaResource extends Model {}
  AgendaResource.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // La llena el hook de empresa al crear (models/index.js); en la base es NOT NULL.
    company_id:   { type: DataTypes.INTEGER, allowNull: true },
    warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
    kind:         { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'persona' },
    name:         { type: DataTypes.STRING(80), allowNull: false },
    // Citas a la vez. Una persona atiende de a una; un puesto puede tener varias bahías.
    capacity:     { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
    // Vendedor que gana la comisión de lo que se cobra en sus citas.
    seller_id:    { type: DataTypes.INTEGER, allowNull: true },
    // Su usuario: ve y atiende sus citas aunque no tenga los permisos de la agenda.
    employee_id:  { type: DataTypes.INTEGER, allowNull: true },
    color:        { type: DataTypes.STRING(7), allowNull: true },
    sort_order:   { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    active:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'agenda_resources',
    modelName: 'AgendaResource',
    timestamps: false,
  });
  return AgendaResource;
};
