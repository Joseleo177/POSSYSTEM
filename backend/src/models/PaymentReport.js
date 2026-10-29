'use strict';
const { Model } = require('sequelize');

// Pago que el cliente reporta desde el catálogo: "pagué por pago móvil, referencia 123456".
// No es dinero en ninguna caja hasta que se aplica como cobro de la factura (payment_id).
//
// status: pendiente → confirmado (lo casó el extracto o lo confirmó alguien) → aplicado (la
// caja lo registró como cobro). rechazado en cualquier punto antes de aplicarse.
// `amount` va en la moneda de la cuenta; `amount_base` a la tasa del día en que se reportó.
// Ver services/paymentReports.js y la migración 20261101150000-pedidos-web-entrega-pago.
module.exports = (sequelize, DataTypes) => {
  class PaymentReport extends Model {}
  PaymentReport.init({
    id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:        { type: DataTypes.INTEGER, allowNull: false },
    sale_id:           { type: DataTypes.INTEGER, allowNull: true },
    customer_id:       { type: DataTypes.INTEGER, allowNull: true },
    journal_id:        { type: DataTypes.INTEGER, allowNull: false },
    payment_method:    { type: DataTypes.STRING(30), allowNull: true },
    currency_id:       { type: DataTypes.INTEGER, allowNull: true },
    amount:            { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    exchange_rate:     { type: DataTypes.DECIMAL(18, 6), allowNull: false, defaultValue: 1 },
    amount_base:       { type: DataTypes.DECIMAL(14, 6), allowNull: false },
    reference_number:  { type: DataTypes.STRING(100), allowNull: false },
    reference_date:    { type: DataTypes.DATEONLY, allowNull: false },
    payer_bank:        { type: DataTypes.STRING(80), allowNull: true },
    payer_phone:       { type: DataTypes.STRING(30), allowNull: true },
    status:            { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'pendiente' },
    confirmed_via:     { type: DataTypes.STRING(10), allowNull: true },
    statement_line_id: { type: DataTypes.INTEGER, allowNull: true },
    payment_id:        { type: DataTypes.INTEGER, allowNull: true },
    reviewed_by:       { type: DataTypes.INTEGER, allowNull: true },
    reviewed_at:       { type: DataTypes.DATE, allowNull: true },
    reject_reason:     { type: DataTypes.STRING(200), allowNull: true },
    created_at:        { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'payment_reports',
    modelName: 'PaymentReport',
    timestamps: false,
  });
  return PaymentReport;
};
