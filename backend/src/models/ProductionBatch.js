'use strict';
const { Model } = require('sequelize');

// Una tanda producida (OP-0001): lo que se gastó y lo que salió de verdad. Ver la migración
// 20261101110000-produccion y services/production.js.
module.exports = (sequelize, DataTypes) => {
  class ProductionBatch extends Model {}
  ProductionBatch.init({
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:     { type: DataTypes.INTEGER, allowNull: false },
    number:         { type: DataTypes.INTEGER, allowNull: false },
    warehouse_id:   { type: DataTypes.INTEGER, allowNull: false },
    product_id:     { type: DataTypes.INTEGER, allowNull: false },
    batches:        { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 1 },
    expected_yield: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
    actual_yield:   { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    total_cost:     { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    unit_cost:      { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
    notes:          { type: DataTypes.STRING(300), allowNull: true },
    status:         { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'hecha' },
    employee_id:    { type: DataTypes.INTEGER, allowNull: true },
    annulled_at:    { type: DataTypes.DATE, allowNull: true },
    annulled_by:    { type: DataTypes.INTEGER, allowNull: true },
    created_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'production_batches',
    modelName: 'ProductionBatch',
    timestamps: false,
  });
  return ProductionBatch;
};
