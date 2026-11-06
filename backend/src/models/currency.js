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
    // La que la pantalla muestra junto a la base (los bolívares). Una por empresa: antes se
    // tomaba la primera divisa por código y los pesos (COP) desplazaban a los Bs.
    is_local: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Tasa alterna de otra moneda: "Bs (USDT)" a 1100 junto al bolívar a la tasa BCV. Mismo
    // código y símbolo que la moneda madre; solo cambia la tasa. Ver migración 20261114.
    rate_of_id: { type: DataTypes.INTEGER, allowNull: true },
    // "Sincronizar tasas" solo toca las que tengan esto encendido. La tasa USDT y los pesos de
    // frontera los pone la tienda: la tasa internacional del peso no es la de Cúcuta.
    auto_sync: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'currencies',
    modelName: 'Currency',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['code', 'company_id'],
        where: { rate_of_id: null }
      }
    ]
  });
  return Currency;
};
