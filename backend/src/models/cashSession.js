'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CashSession extends Model {
    static associate(models) {}
  }
  CashSession.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employee_id:  { type: DataTypes.INTEGER },
    warehouse_id: { type: DataTypes.INTEGER },
    status:       { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
    notes:        { type: DataTypes.TEXT },
    opened_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    closed_at:    { type: DataTypes.DATE },
  }, {
    sequelize,
    tableName:  'cash_sessions',
    modelName:  'CashSession',
    timestamps: false,
  });
  return CashSession;
};
