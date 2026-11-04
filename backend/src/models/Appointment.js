'use strict';
const { Model } = require('sequelize');

// Cita de la agenda. Ver migración 20261107100000-agenda y services/agenda.
// "Cobrada" no es un estado de aquí: la cita terminada abre una venta (sale_id) y lo cobrado se
// lee de esa venta.
module.exports = (sequelize, DataTypes) => {
  class Appointment extends Model {}
  Appointment.init({
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:     { type: DataTypes.INTEGER, allowNull: true },
    warehouse_id:   { type: DataTypes.INTEGER, allowNull: false },
    resource_id:    { type: DataTypes.INTEGER, allowNull: false },
    starts_at:      { type: DataTypes.DATE, allowNull: false },
    ends_at:        { type: DataTypes.DATE, allowNull: false },
    status:         { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'confirmada' },
    source:         { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'interno' },
    customer_id:    { type: DataTypes.INTEGER, allowNull: true },
    customer_name:  { type: DataTypes.STRING(120), allowNull: true },
    customer_phone: { type: DataTypes.STRING(30), allowNull: true },
    customer_doc:   { type: DataTypes.STRING(20), allowNull: true },
    notes:          { type: DataTypes.STRING(300), allowNull: true },
    sale_id:        { type: DataTypes.INTEGER, allowNull: true },
    created_by:     { type: DataTypes.INTEGER, allowNull: true },
    created_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'appointments',
    modelName: 'Appointment',
    timestamps: false,
  });
  return Appointment;
};
