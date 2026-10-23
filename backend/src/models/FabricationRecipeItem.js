'use strict';
const { Model } = require('sequelize');

// Línea de una receta, por unidad: material (cortes), accesorio (cantidad) o proceso (minutos
// en una etapa). Los valores son fórmulas en texto; un número también lo es.
module.exports = (sequelize, DataTypes) => {
  class FabricationRecipeItem extends Model {}
  FabricationRecipeItem.init({
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:    { type: DataTypes.INTEGER, allowNull: true },
    recipe_id:     { type: DataTypes.INTEGER, allowNull: false },
    kind:          { type: DataTypes.STRING(20), allowNull: false },
    component_id:  { type: DataTypes.INTEGER, allowNull: true },
    stage_id:      { type: DataTypes.INTEGER, allowNull: true },
    width_expr:    { type: DataTypes.STRING(200), allowNull: true },
    length_expr:   { type: DataTypes.STRING(200), allowNull: true },
    cuts_expr:     { type: DataTypes.STRING(200), allowNull: true },
    quantity_expr: { type: DataTypes.STRING(200), allowNull: true },
    minutes_expr:  { type: DataTypes.STRING(200), allowNull: true },
    position:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    tableName: 'fabrication_recipe_items',
    modelName: 'FabricationRecipeItem',
    timestamps: false,
  });
  return FabricationRecipeItem;
};
