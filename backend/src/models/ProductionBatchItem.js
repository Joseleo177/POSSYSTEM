'use strict';
const { Model } = require('sequelize');

// Cada insumo de una tanda: lo que pedía la receta y lo que se usó, al costo de ese día.
module.exports = (sequelize, DataTypes) => {
  class ProductionBatchItem extends Model {}
  ProductionBatchItem.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: false },
    batch_id:     { type: DataTypes.INTEGER, allowNull: false },
    product_id:   { type: DataTypes.INTEGER, allowNull: false },
    expected_qty: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
    actual_qty:   { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    unit_cost:    { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    cost:         { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    tableName: 'production_batch_items',
    modelName: 'ProductionBatchItem',
    timestamps: false,
  });
  return ProductionBatchItem;
};
