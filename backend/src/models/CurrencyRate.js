'use strict';
const { Model } = require('sequelize');

// Tasa con la que el negocio cobró un día (ver migración 20261108100000-historial-tasas). La
// lee services/currencyRates para convertir un cobro registrado tarde a la tasa de su fecha.
module.exports = (sequelize, DataTypes) => {
  class CurrencyRate extends Model {
    static associate(models) {}
  }
  CurrencyRate.init({
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // La llena el hook de empresa al crear (models/index.js); en la base es NOT NULL.
    company_id:  { type: DataTypes.INTEGER, allowNull: true },
    currency_id: { type: DataTypes.INTEGER, allowNull: false },
    rate_date:   { type: DataTypes.DATEONLY, allowNull: false },
    rate:        { type: DataTypes.DECIMAL(14, 6), allowNull: false },
    source:      { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'manual' },
    employee_id: { type: DataTypes.INTEGER, allowNull: true },
    updated_at:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'currency_rates',
    modelName: 'CurrencyRate',
    timestamps: false,
  });
  return CurrencyRate;
};
