'use strict';
const { Model } = require('sequelize');

// Franja del horario semanal de un recurso, en minutos desde la medianoche (9:00 = 540).
// weekday: 0 domingo … 6 sábado. Ver migración 20261107100000-agenda.
module.exports = (sequelize, DataTypes) => {
  class AgendaHour extends Model {}
  AgendaHour.init({
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:  { type: DataTypes.INTEGER, allowNull: true },
    resource_id: { type: DataTypes.INTEGER, allowNull: false },
    weekday:     { type: DataTypes.SMALLINT, allowNull: false },
    start_min:   { type: DataTypes.SMALLINT, allowNull: false },
    end_min:     { type: DataTypes.SMALLINT, allowNull: false },
  }, {
    sequelize,
    tableName: 'agenda_hours',
    modelName: 'AgendaHour',
    timestamps: false,
  });
  return AgendaHour;
};
