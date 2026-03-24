'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CashSessionJournal extends Model {
    static associate(models) {}
  }
  CashSessionJournal.init({
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    session_id:      { type: DataTypes.INTEGER },
    journal_id:      { type: DataTypes.INTEGER },
    opening_amount:  { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
    closing_amount:  { type: DataTypes.DECIMAL(12,2) },
    expected_amount: { type: DataTypes.DECIMAL(12,2) },
    difference:      { type: DataTypes.DECIMAL(12,2) },
  }, {
    sequelize,
    tableName:  'cash_session_journals',
    modelName:  'CashSessionJournal',
    timestamps: false,
  });
  return CashSessionJournal;
};
