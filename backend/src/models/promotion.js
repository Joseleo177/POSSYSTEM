'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Promotion extends Model {
    static associate(models) {}
  }
  Promotion.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:         { type: DataTypes.STRING(200), allowNull: false },
    type:         { type: DataTypes.STRING(20),  allowNull: false },
    discount_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    buy_qty:      { type: DataTypes.INTEGER, allowNull: true },
    get_qty:      { type: DataTypes.INTEGER, allowNull: true },
    starts_at:    { type: DataTypes.DATE, allowNull: false },
    ends_at:      { type: DataTypes.DATE, allowNull: true },
    active:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    tableName: 'promotions',
    modelName: 'Promotion',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return Promotion;
};
