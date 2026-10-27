'use strict';
const { Model } = require('sequelize');

// Qué grupos de adicionales lleva cada plato, y en qué orden se ofrecen.
module.exports = (sequelize, DataTypes) => {
  class ProductModifierGroup extends Model {}
  ProductModifierGroup.init({
    product_id: { type: DataTypes.INTEGER, primaryKey: true },
    group_id:   { type: DataTypes.INTEGER, primaryKey: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    tableName: 'product_modifier_groups',
    modelName: 'ProductModifierGroup',
    timestamps: false,
  });
  return ProductModifierGroup;
};
