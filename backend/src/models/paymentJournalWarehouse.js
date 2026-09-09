'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PaymentJournalWarehouse extends Model {
    static associate(models) {}
  }
  PaymentJournalWarehouse.init({
    journal_id:   { type: DataTypes.INTEGER, primaryKey: true },
    warehouse_id: { type: DataTypes.INTEGER, primaryKey: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    tableName: 'payment_journal_warehouses',
    modelName: 'PaymentJournalWarehouse',
    timestamps: false,
  });
  return PaymentJournalWarehouse;
};
