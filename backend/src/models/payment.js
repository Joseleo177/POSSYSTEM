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
    amount:             { type: DataTypes.DECIMAL(12, 6), allowNull: false },
    currency_id:        { type: DataTypes.INTEGER },
    exchange_rate:      { type: DataTypes.DECIMAL(12, 6), allowNull: false, defaultValue: 1.0 },
    payment_journal_id: { type: DataTypes.INTEGER },
    employee_id:        { type: DataTypes.INTEGER },
    reference_date:     { type: DataTypes.DATEONLY },
    reference_number:   { type: DataTypes.STRING(100) },
    notes:              { type: DataTypes.TEXT },
    change_given:       { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    change_journal_id:  { type: DataTypes.INTEGER, allowNull: true },
    // Clave que genera la caja una vez por cobro y repite en los reintentos: con el índice
    // único de la base, un abono parcial reenviado tras un corte de red no se registra dos
    // veces. Null en los pagos anteriores a la migración.
    idempotency_key:    { type: DataTypes.STRING(100), allowNull: true },
    // Cobros que entraron en un solo acto: el cliente saldó varias facturas con un único
    // monto. Contra la caja eso es UN movimiento, y por eso el diario los agrupa por esta
    // clave en vez de listar una línea por factura. Null en un cobro corriente.
    batch_id:           { type: DataTypes.STRING(64), allowNull: true },
    created_at:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'payments',
    modelName: 'Payment',
    timestamps: false
  });
  return Payment;
};
