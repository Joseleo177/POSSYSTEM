'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Purchase extends Model {
    static associate(models) {}
  }
  Purchase.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    supplier_id: { type: DataTypes.INTEGER },
    supplier_name: { type: DataTypes.STRING(200) },
    notes: { type: DataTypes.TEXT },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    // Moneda y tasa con que se cargó la factura del proveedor. El total y los costos siguen
    // guardándose en moneda base: esto es el registro de a qué tasa se compró ese día.
    currency_id:   { type: DataTypes.INTEGER },
    exchange_rate: { type: DataTypes.DECIMAL(12, 6), allowNull: false, defaultValue: 1.0 },
    employee_id:     { type: DataTypes.INTEGER },
    warehouse_id:    { type: DataTypes.INTEGER },
    status:          { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'borrador' },
    payment_status:  { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pendiente' },
    created_at:      { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'purchases',
    modelName: 'Purchase',
    timestamps: false
  });
  return Purchase;
};
