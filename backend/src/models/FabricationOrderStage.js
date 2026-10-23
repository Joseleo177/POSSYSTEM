'use strict';
const { Model } = require('sequelize');

// El paso de una orden por una etapa: quién la hizo, cuántos minutos y a qué costo por hora
// (el de ese momento: cambiar la tarifa después no reescribe lo ya trabajado).
module.exports = (sequelize, DataTypes) => {
  class FabricationOrderStage extends Model {}
  FabricationOrderStage.init({
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:    { type: DataTypes.INTEGER, allowNull: true },
    order_id:      { type: DataTypes.INTEGER, allowNull: false },
    stage_id:      { type: DataTypes.INTEGER, allowNull: false },
    stage_name:    { type: DataTypes.STRING(60), allowNull: false },
    started_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finished_at:   { type: DataTypes.DATE, allowNull: true },
    minutes:       { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    cost_per_hour: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    cost:          { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    worker:        { type: DataTypes.STRING(80), allowNull: true },
    note:          { type: DataTypes.STRING(300), allowNull: true },
    employee_id:   { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    tableName: 'fabrication_order_stages',
    modelName: 'FabricationOrderStage',
    timestamps: false,
  });
  return FabricationOrderStage;
};
