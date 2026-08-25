'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Return extends Model {
    static associate(models) {}
  }
  Return.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sale_id: { type: DataTypes.INTEGER, allowNull: false },
    employee_id: { type: DataTypes.INTEGER },
    reason: { type: DataTypes.STRING(500) },
    nc_number: { type: DataTypes.STRING(50), allowNull: true },
    // 6 decimales, como payments.amount y customers.credit_balance: el crédito de la nota va a
    // parar ahí, y redondear aquí a dos decimales le devolvía al cliente unos bolívares menos
    // de los que pagó (ver la migración returns-money-precision).
    total: { type: DataTypes.DECIMAL(14, 6), allowNull: false, defaultValue: 0 },
    // 'activo' | 'anulado'. La anulada se conserva por auditoría —el correlativo ya se
    // quemó— pero no cuenta en inventario, saldos ni en el descuento sobre la factura.
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'activo' },
    annulled_at: { type: DataTypes.DATE, allowNull: true },
    annulled_by: { type: DataTypes.INTEGER, allowNull: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'returns',
    modelName: 'Return',
    timestamps: false
  });
  return Return;
};
