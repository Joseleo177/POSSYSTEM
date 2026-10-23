'use strict';
const { Model } = require('sequelize');

// La receta ya calculada con los valores de la orden, por unidad. El total es esto por la
// cantidad de la orden; editar la receta después no cambia lo que una orden vieja debía gastar.
module.exports = (sequelize, DataTypes) => {
  class FabricationOrderPlan extends Model {}
  FabricationOrderPlan.init({
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:    { type: DataTypes.INTEGER, allowNull: true },
    order_id:      { type: DataTypes.INTEGER, allowNull: false },
    kind:          { type: DataTypes.STRING(20), allowNull: false },
    component_id:  { type: DataTypes.INTEGER, allowNull: true },
    stage_id:      { type: DataTypes.INTEGER, allowNull: true },
    name:          { type: DataTypes.STRING(200), allowNull: false },
    cut_width_mm:  { type: DataTypes.INTEGER, allowNull: true },
    cut_length_mm: { type: DataTypes.INTEGER, allowNull: true },
    cuts:          { type: DataTypes.INTEGER, allowNull: true },
    quantity:      { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    minutes:       { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    position:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    tableName: 'fabrication_order_plan',
    modelName: 'FabricationOrderPlan',
    timestamps: false,
  });
  return FabricationOrderPlan;
};
