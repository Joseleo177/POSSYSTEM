'use strict';
const { Model } = require('sequelize');

// Lo que lleva UNA tanda de una preparación (la olla de sopa): `quantity` es el bruto que se
// gasta; `net_quantity` y `waste_pct`, como en las recetas de platos. Ver la migración
// 20261101110000-produccion.
module.exports = (sequelize, DataTypes) => {
  class PreparationItem extends Model {}
  PreparationItem.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: false },
    prep_id:      { type: DataTypes.INTEGER, allowNull: false },
    product_id:   { type: DataTypes.INTEGER, allowNull: false },
    quantity:     { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    net_quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
    waste_pct:    { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    tableName: 'preparation_items',
    modelName: 'PreparationItem',
    timestamps: false,
  });
  return PreparationItem;
};
