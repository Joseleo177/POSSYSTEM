'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PaymentJournal extends Model {
    static associate(models) {}
  }
  PaymentJournal.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'efectivo' },
    bank_id: { type: DataTypes.INTEGER },
    color: { type: DataTypes.STRING(7), allowNull: false, defaultValue: '#555555' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    currency_id: { type: DataTypes.INTEGER }
  }, {
    sequelize,
    tableName: 'payment_journals',
    modelName: 'PaymentJournal',
    timestamps: false
  });
  return PaymentJournal;
};
