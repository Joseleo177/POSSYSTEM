'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Payment extends Model {
    static associate(models) {}
  }
  Payment.init({
    id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    sale_id:            { type: DataTypes.INTEGER, allowNull: false },
    customer_id:        { type: DataTypes.INTEGER },
    amount:             { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency_id:        { type: DataTypes.INTEGER },
    exchange_rate:      { type: DataTypes.DECIMAL(12, 6), allowNull: false, defaultValue: 1.0 },
    payment_journal_id: { type: DataTypes.INTEGER },
    employee_id:        { type: DataTypes.INTEGER },
    reference_date:     { type: DataTypes.DATEONLY },
    reference_number:   { type: DataTypes.STRING(100) },
    notes:              { type: DataTypes.TEXT },
    change_given:       { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    change_journal_id:  { type: DataTypes.INTEGER, allowNull: true },
    created_at:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'payments',
    modelName: 'Payment',
    timestamps: false
  });
  return Payment;
};
