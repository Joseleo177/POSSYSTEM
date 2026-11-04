'use strict';
const { Model } = require('sequelize');

// Servicio de una cita, con la duración que tenía al agendarse: cambiar mañana lo que dura un
// corte no debe mover las citas ya dadas. El precio NO se guarda: se cobra el de la sucursal
// el día del cobro, como cualquier venta. Ver migración 20261107100000-agenda.
module.exports = (sequelize, DataTypes) => {
  class AppointmentItem extends Model {}
  AppointmentItem.init({
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:     { type: DataTypes.INTEGER, allowNull: true },
    appointment_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id:     { type: DataTypes.INTEGER, allowNull: false },
    name:           { type: DataTypes.STRING(200), allowNull: false },
    duration_min:   { type: DataTypes.SMALLINT, allowNull: false },
  }, {
    sequelize,
    tableName: 'appointment_items',
    modelName: 'AppointmentItem',
    timestamps: false,
  });
  return AppointmentItem;
};
