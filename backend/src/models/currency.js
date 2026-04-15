'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Currency extends Model {
    static associate(models) {}
  }
  Currency.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(3), allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    symbol: { type: DataTypes.STRING(5), allowNull: false },
    exchange_rate: { type: DataTypes.DECIMAL(12, 6), allowNull: false, defaultValue: 1.0 },
    is_base: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'currencies',
    modelName: 'Currency',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['code', 'company_id']
      }
    ]
  });
  return Currency;
};
