'use strict';
const { Model } = require('sequelize');

// Pedido hecho por el cliente desde el QR de su mesa. Ver la migración 20261101140000-pedidos-qr
// y services/pedidosQr.js.
module.exports = (sequelize, DataTypes) => {
  class TableOrder extends Model {}
  TableOrder.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: false },
    table_id:     { type: DataTypes.INTEGER, allowNull: false },
    warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
    items:        { type: DataTypes.JSONB, allowNull: false },
    summary:      { type: DataTypes.STRING(500), allowNull: true },
    estimate:     { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    note:         { type: DataTypes.STRING(200), allowNull: true },
    status:       { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'pendiente' },
    reason:       { type: DataTypes.STRING(200), allowNull: true },
    sale_id:      { type: DataTypes.INTEGER, allowNull: true },
    ticket_id:    { type: DataTypes.INTEGER, allowNull: true },
    resolved_by:  { type: DataTypes.INTEGER, allowNull: true },
    resolved_at:  { type: DataTypes.DATE, allowNull: true },
    created_at:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'table_orders',
    modelName: 'TableOrder',
    timestamps: false,
  });
  return TableOrder;
};
