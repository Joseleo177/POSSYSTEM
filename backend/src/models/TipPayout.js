'use strict';
const { Model } = require('sequelize');

// Pago de propinas a una persona (ver migración 20261121120000-propinas). El dinero sale por el
// egreso de expense_id; si ese egreso se anula, el pago deja de contar. Un reparto del pozo es un
// solo egreso con varias filas marcadas from_pool.
module.exports = (sequelize, DataTypes) => {
  class TipPayout extends Model {
    static associate() {}
  }
  TipPayout.init({
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:  { type: DataTypes.INTEGER, allowNull: true },
    seller_id:   { type: DataTypes.INTEGER, allowNull: false },
    // En moneda base, como la propina.
    amount:      { type: DataTypes.DECIMAL(14, 5), allowNull: false },
    from_pool:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    expense_id:  { type: DataTypes.INTEGER, allowNull: true },
    paid_at:     { type: DataTypes.DATEONLY, allowNull: false },
    // Período del pozo que se repartió (solo en los repartos).
    period_from: { type: DataTypes.DATEONLY, allowNull: true },
    period_to:   { type: DataTypes.DATEONLY, allowNull: true },
    notes:       { type: DataTypes.STRING(300), allowNull: true },
    employee_id: { type: DataTypes.INTEGER, allowNull: true },
    created_at:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'tip_payouts',
    modelName: 'TipPayout',
    timestamps: false,
  });
  return TipPayout;
};
