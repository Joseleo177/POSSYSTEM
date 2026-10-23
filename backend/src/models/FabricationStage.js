'use strict';
const { Model } = require('sequelize');

// Etapa del taller que define cada empresa (Corte, Doblez, Soldadura...), con su costo por
// hora. Es la columna del tablero y la base de la mano de obra.
module.exports = (sequelize, DataTypes) => {
  class FabricationStage extends Model {}
  FabricationStage.init({
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:    { type: DataTypes.INTEGER, allowNull: true },
    name:          { type: DataTypes.STRING(60), allowNull: false },
    position:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    cost_per_hour: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    active:        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    sequelize,
    tableName: 'fabrication_stages',
    modelName: 'FabricationStage',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return FabricationStage;
};
