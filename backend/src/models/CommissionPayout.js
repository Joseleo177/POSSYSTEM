'use strict';
const { Model } = require('sequelize');

// Liquidación de comisiones a un vendedor (ver migración 20261105100000-comisiones). El dinero
// sale por el egreso de expense_id; si ese egreso se anula, la liquidación deja de contar.
module.exports = (sequelize, DataTypes) => {
  class CommissionPayout extends Model {
    static associate(models) {}
  }
  CommissionPayout.init({
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:  { type: DataTypes.INTEGER, allowNull: true },
    seller_id:   { type: DataTypes.INTEGER, allowNull: false },
    // En moneda base, como la comisión.
    amount:      { type: DataTypes.DECIMAL(14, 5), allowNull: false },
    expense_id:  { type: DataTypes.INTEGER, allowNull: true },
    paid_at:     { type: DataTypes.DATEONLY, allowNull: false },
    notes:       { type: DataTypes.STRING(300), allowNull: true },
    employee_id: { type: DataTypes.INTEGER, allowNull: true },
    created_at:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'commission_payouts',
    modelName: 'CommissionPayout',
    timestamps: false,
  });
  return CommissionPayout;
};
