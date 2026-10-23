'use strict';
const { Model } = require('sequelize');

// Receta de un producto: sus variables (largo, ancho, puertas...) y, por unidad, los cortes,
// accesorios y minutos de taller como fórmulas (ver migración 20261024100000).
module.exports = (sequelize, DataTypes) => {
  class FabricationRecipe extends Model {
    static associate(models) {
      FabricationRecipe.belongsTo(models.Product, { foreignKey: 'product_id' });
      FabricationRecipe.hasMany(models.FabricationRecipeItem, { as: 'items', foreignKey: 'recipe_id' });
    }
  }
  FabricationRecipe.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: true },
    product_id:   { type: DataTypes.INTEGER, allowNull: false },
    unit:         { type: DataTypes.STRING(2), allowNull: false, defaultValue: 'm' },
    params:       { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    instructions: { type: DataTypes.TEXT, allowNull: true },
    employee_id:  { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    tableName: 'fabrication_recipes',
    modelName: 'FabricationRecipe',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return FabricationRecipe;
};
