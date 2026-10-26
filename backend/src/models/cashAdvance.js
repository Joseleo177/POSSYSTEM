'use strict';
const { Model } = require('sequelize');

// Avance de efectivo: el cliente se lleva billetes y los paga por el punto con una comisión
// encima. Ata el egreso de la caja y los dos ingresos de la cuenta que recibe (ver
// services/cashAdvances y la migración 20261029100000).
module.exports = (sequelize, DataTypes) => {
  class CashAdvance extends Model {
    static associate(models) {
      CashAdvance.belongsTo(models.PaymentJournal, { foreignKey: 'cash_journal_id', as: 'cashJournal' });
      CashAdvance.belongsTo(models.PaymentJournal, { foreignKey: 'in_journal_id', as: 'inJournal' });
      CashAdvance.belongsTo(models.Customer,       { foreignKey: 'customer_id', as: 'customer' });
      CashAdvance.belongsTo(models.Employee,       { foreignKey: 'employee_id', as: 'employee' });
    }
  }
  CashAdvance.init({
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:      { type: DataTypes.INTEGER, allowNull: true },
    warehouse_id:    { type: DataTypes.INTEGER, allowNull: true },
    employee_id:     { type: DataTypes.INTEGER, allowNull: true },
    customer_id:     { type: DataTypes.INTEGER, allowNull: true },
    sale_id:         { type: DataTypes.INTEGER, allowNull: true },
    // El cobro con el que pasó por el punto (si fue junto a una venta): la conciliación los junta.
    payment_id:      { type: DataTypes.INTEGER, allowNull: true },
    cash_amount:     { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    cash_journal_id: { type: DataTypes.INTEGER, allowNull: false },
    fee_pct:         { type: DataTypes.DECIMAL(7, 3), allowNull: false, defaultValue: 0 },
    in_amount:       { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    fee_amount:      { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    in_journal_id:   { type: DataTypes.INTEGER, allowNull: false },
    in_method:       { type: DataTypes.STRING(30), allowNull: true },
    reference:       { type: DataTypes.STRING(50), allowNull: true },
    status:          { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'activo' },
    created_at:      { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'cash_advances',
    modelName: 'CashAdvance',
    timestamps: false,
  });
  return CashAdvance;
};
