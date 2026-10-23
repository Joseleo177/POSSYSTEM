'use strict';
const { Model } = require('sequelize');

// Cuántos cortes de un tipo de la receta (plan_id) cubre una pieza entregada (use_id). Una
// misma pieza puede cubrir varios cortes distintos de su orden: el cuerpo y las puertas.
module.exports = (sequelize, DataTypes) => {
  class FabricationOrderCut extends Model {}
  FabricationOrderCut.init({
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    order_id:   { type: DataTypes.INTEGER, allowNull: false },
    use_id:     { type: DataTypes.INTEGER, allowNull: false },
    plan_id:    { type: DataTypes.INTEGER, allowNull: false },
    cuts:       { type: DataTypes.INTEGER, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'fabrication_order_cuts',
    modelName: 'FabricationOrderCut',
    timestamps: false,
  });
  return FabricationOrderCut;
};
