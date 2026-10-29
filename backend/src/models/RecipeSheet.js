'use strict';
const { Model } = require('sequelize');

// Ficha técnica de un plato (app Recetas): lo que no va en las líneas de la receta, que son
// sus product_combo_items. `combo_since` es cuándo el plato empezó a descontar su receta;
// las ventas de antes no descontaron nada. Ver la migración 20261101100000-recetas.
module.exports = (sequelize, DataTypes) => {
  class RecipeSheet extends Model {}
  RecipeSheet.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: false },
    product_id:   { type: DataTypes.INTEGER, allowNull: false },
    instructions: { type: DataTypes.TEXT, allowNull: true },
    prep_minutes: { type: DataTypes.INTEGER, allowNull: true },
    combo_since:  { type: DataTypes.DATE, allowNull: true },
    // 'plato' (se vende y descuenta su receta) o 'preparacion' (se produce por tanda y tiene
    // existencia: la olla de sopa). batch_yield: lo que rinde una tanda, en la unidad del
    // producto. Ver la migración 20261101110000-produccion.
    kind:         { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'plato' },
    batch_yield:  { type: DataTypes.DECIMAL(12, 3), allowNull: true },
    updated_by:   { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    tableName: 'recipe_sheets',
    modelName: 'RecipeSheet',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return RecipeSheet;
};
