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
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    // Sucursal dueña del diario. NULL = compartido entre todas (p. ej. una cuenta bancaria
    // de la empresa donde entran cobros de cualquier tienda).
    warehouse_id: { type: DataTypes.INTEGER, allowNull: true },
    bank_id: { type: DataTypes.INTEGER },
    color: { type: DataTypes.STRING(7), allowNull: false, defaultValue: '#555555' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    currency_id: { type: DataTypes.INTEGER },
    // El diario es la CUENTA (Banco de Venezuela, la gaveta de efectivo) y acepta varios
    // métodos, cada uno con su sentido: ver PaymentJournalMethod. `type` queda como el método
    // principal, el que se usa cuando un movimiento no dice por cuál entró.
    account_number:  { type: DataTypes.STRING(40), allowNull: true },
    // Saldo de la cuenta antes del primer movimiento registrado en el sistema.
    opening_balance: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    opening_date:    { type: DataTypes.DATEONLY, allowNull: true },
    // Diario absorbido al fusionar cuentas (migración journal-accounts): no se lista.
    merged_into_id:  { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    tableName: 'payment_journals',
    modelName: 'PaymentJournal',
    timestamps: false
  });
  return PaymentJournal;
};
