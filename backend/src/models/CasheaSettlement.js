'use strict';
const { Model } = require('sequelize');

// Liquidación de Cashea: el depósito con que Cashea paga lo que financió de varias ventas.
// Ata los cobros que liquida (payments.cashea_settlement_id) y los movimientos que asienta: el
// traspaso del diario Cashea al banco y la comisión (ver services/cashea y la migración
// 20261106100000).
module.exports = (sequelize, DataTypes) => {
  class CasheaSettlement extends Model {
    static associate(models) {
      CasheaSettlement.belongsTo(models.PaymentJournal, { foreignKey: 'journal_id', as: 'journal' });
      CasheaSettlement.belongsTo(models.Employee,       { foreignKey: 'employee_id', as: 'employee' });
    }
  }
  CasheaSettlement.init({
    id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:        { type: DataTypes.INTEGER, allowNull: true },
    journal_id:        { type: DataTypes.INTEGER, allowNull: false },
    payment_method:    { type: DataTypes.STRING(30), allowNull: true },
    cashea_journal_id: { type: DataTypes.INTEGER, allowNull: false },
    sale_count:        { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    owed_amount:       { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    received_amount:   { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    rate:              { type: DataTypes.DECIMAL(14, 6), allowNull: false, defaultValue: 1 },
    received_base:     { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    commission:        { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    date:              { type: DataTypes.DATEONLY, allowNull: false },
    reference:         { type: DataTypes.STRING(50), allowNull: true },
    notes:             { type: DataTypes.TEXT, allowNull: true },
    employee_id:       { type: DataTypes.INTEGER, allowNull: true },
    status:            { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'activo' },
    created_at:        { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'cashea_settlements',
    modelName: 'CasheaSettlement',
    timestamps: false,
  });
  return CasheaSettlement;
};
