'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Sale extends Model {
    static associate(models) {}
  }
  Sale.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    total: { type: DataTypes.DECIMAL(14, 5), allowNull: false },
    paid: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    change: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    customer_id: { type: DataTypes.INTEGER },
    employee_id: { type: DataTypes.INTEGER },
    currency_id: { type: DataTypes.INTEGER },
    exchange_rate: { type: DataTypes.DECIMAL(12, 6), allowNull: false, defaultValue: 1.0 },
    discount_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    payment_method: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'efectivo' },
    payment_method_id: { type: DataTypes.INTEGER },
    payment_journal_id: { type: DataTypes.INTEGER },
    warehouse_id: { type: DataTypes.INTEGER },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    status:             { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pendiente' },
    serie_id:           { type: DataTypes.INTEGER },
    serie_range_id:     { type: DataTypes.INTEGER },
    correlative_number: { type: DataTypes.INTEGER },
    invoice_number:     { type: DataTypes.STRING(50) },
    idempotency_key:    { type: DataTypes.STRING(64), allowNull: true, unique: true },
    credit_applied:     { type: DataTypes.DECIMAL(14, 6), allowNull: false, defaultValue: 0 },
    // Caja que tiene la cuenta abierta en su carrito. Mientras esté puesto, las demás la ven
    // bloqueada en lugar de poder tomarla o eliminarla. held_at permite soltarla sola si el
    // cajero abandona sin cerrarla (ver HOLD_TIMEOUT_MIN en holdLock.js).
    held_by_employee_id: { type: DataTypes.INTEGER, allowNull: true },
    held_at:             { type: DataTypes.DATE,    allowNull: true },
    // Solo se llenan en pedidos llegados del catálogo público (status 'pedido')
    web_customer_name:  { type: DataTypes.STRING(120), allowNull: true },
    web_customer_phone: { type: DataTypes.STRING(30),  allowNull: true },
    web_note:           { type: DataTypes.TEXT,        allowNull: true },
    created_at:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'sales',
    modelName: 'Sale',
    timestamps: false
  });
  return Sale;
};
