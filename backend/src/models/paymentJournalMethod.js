'use strict';
const { Model } = require('sequelize');

// Métodos que acepta una cuenta (diario) y en qué sentido cada uno. El Banco de Venezuela
// cobra por pago móvil, punto y biopago; el punto además hace reintegros y el biopago no.
module.exports = (sequelize, DataTypes) => {
  class PaymentJournalMethod extends Model {
    static associate(models) {}
  }
  PaymentJournalMethod.init({
    id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    journal_id:     { type: DataTypes.INTEGER, allowNull: false },
    company_id:     { type: DataTypes.INTEGER, allowNull: true },
    method_code:    { type: DataTypes.STRING(30), allowNull: false },
    allows_inflow:  { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allows_outflow: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sort_order:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    sequelize,
    tableName: 'payment_journal_methods',
    modelName: 'PaymentJournalMethod',
    timestamps: false,
  });
  return PaymentJournalMethod;
};
