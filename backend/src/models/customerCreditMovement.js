'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CustomerCreditMovement extends Model {
    static associate(models) {}
  }
  CustomerCreditMovement.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    customer_id: { type: DataTypes.INTEGER, allowNull: false },
    // NULL = compartido: crédito sin sucursal de origen conocida (el saldo migrado antes de
    // este ledger), utilizable desde cualquier sucursal. Con sucursal, solo se puede aplicar
    // en ventas de esa misma sucursal (ver creditLedger.js).
    warehouse_id: { type: DataTypes.INTEGER, allowNull: true },
    amount: { type: DataTypes.DECIMAL(14, 6), allowNull: false },
    reason: { type: DataTypes.STRING(30), allowNull: false },
    sale_id: { type: DataTypes.INTEGER, allowNull: true },
    return_id: { type: DataTypes.INTEGER, allowNull: true },
    employee_id: { type: DataTypes.INTEGER, allowNull: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'customer_credit_movements',
    modelName: 'CustomerCreditMovement',
    timestamps: false,
  });
  return CustomerCreditMovement;
};
