'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockTransfer extends Model {
    static associate(models) {
      // Associations are managed in models/index.js
    }
  }
  StockTransfer.init({
    code: DataTypes.STRING(30),
    from_warehouse_id: DataTypes.INTEGER,
    to_warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    // sent | received | received_with_differences | cancelled
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'sent' },
    // none | pending | resolved — solo aplica cuando lo recibido no cuadra con lo despachado.
    difference_status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'none' },
    note: DataTypes.TEXT,
    receipt_note: DataTypes.TEXT,
    // Quien despacha. Se mantiene el nombre viejo de la columna para no romper el histórico.
    employee_id: DataTypes.INTEGER,
    dispatched_at: DataTypes.DATE,
    received_by: DataTypes.INTEGER,
    received_at: DataTypes.DATE,
    cancelled_by: DataTypes.INTEGER,
    cancelled_at: DataTypes.DATE,
    cancel_reason: DataTypes.TEXT,
    // Legacy: el producto vivía en la cabecera cuando cada transferencia era de un solo
    // producto. Se conservan por el histórico previo a 20260821200000; las transferencias
    // nuevas guardan sus productos en stock_transfer_items.
    product_id: DataTypes.INTEGER,
    product_name: DataTypes.STRING(200),
    qty: DataTypes.DECIMAL(10, 3),
  }, {
    sequelize,
    tableName: 'stock_transfers',
    modelName: 'StockTransfer',
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false
  });
  return StockTransfer;
};
