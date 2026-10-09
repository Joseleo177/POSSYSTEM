'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchasePayment extends Model {
    static associate(models) {}
  }
  PurchasePayment.init({
    id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    purchase_id:        { type: DataTypes.INTEGER, allowNull: false },
    amount:             { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency_id:        { type: DataTypes.INTEGER },
    exchange_rate:      { type: DataTypes.DECIMAL(12, 6), allowNull: false, defaultValue: 1.0 },
    payment_journal_id: { type: DataTypes.INTEGER },
    // Por qué método de la cuenta entró o salió el dinero (pago móvil, punto...). El diario
    // es la cuenta; el método se completa y se valida en el hook de models/index.js.
    payment_method: { type: DataTypes.STRING(30), allowNull: true },
    employee_id:        { type: DataTypes.INTEGER },
    reference_date:     { type: DataTypes.DATEONLY },
    reference_number:   { type: DataTypes.STRING(100) },
    notes:              { type: DataTypes.TEXT },
    // Pago conjunto: los pagos del mismo acto comparten esta clave y un solo egreso
    // (`purchase_batch:<batch_id>`). Nulo = pago suelto, con su egreso `purchase_payment:<id>`.
    batch_id:           { type: DataTypes.STRING(64), allowNull: true },
    created_at:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'purchase_payments',
    modelName: 'PurchasePayment',
    timestamps: false
  });
  return PurchasePayment;
};
