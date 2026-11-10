'use strict';
const { Model } = require('sequelize');

// "Otros cargos" de una factura de proveedor: flete, transporte, un servicio. No tocan inventario;
// van a su categoría de gasto y llevan su alícuota. La factura mixta queda en un solo documento y en
// una sola fila del Libro de compras. Monto en moneda base y sin IVA, como los costos de la compra.
module.exports = (sequelize, DataTypes) => {
  class PurchaseCharge extends Model {
    static associate(models) {}
  }
  PurchaseCharge.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    purchase_id: { type: DataTypes.INTEGER, allowNull: false },
    description: { type: DataTypes.STRING(200), allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 6), allowNull: false },
    iva_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    expense_category_id: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'purchase_charges',
    modelName: 'PurchaseCharge',
    timestamps: false,
  });
  return PurchaseCharge;
};
