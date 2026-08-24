'use strict';
const { Model } = require('sequelize');

// Línea de una transferencia. El aislamiento por empresa lo da la cabecera (igual que en
// stock_session_lines): no lleva company_id propio para que un include anidado no arrastre
// el filtro de tenant sobre una columna que no existe.
module.exports = (sequelize, DataTypes) => {
  class StockTransferItem extends Model {
    static associate(models) {
      // Associations are managed in models/index.js
    }
  }
  StockTransferItem.init({
    transfer_id:  { type: DataTypes.INTEGER, allowNull: false },
    product_id:   { type: DataTypes.INTEGER, allowNull: false },
    product_name: { type: DataTypes.STRING(200), allowNull: false },
    unit:         DataTypes.STRING(20),
    qty_sent:     { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    // NULL mientras la mercancía viaja: todavía nadie contó lo que llegó.
    qty_received: DataTypes.DECIMAL(14, 4),
    diff_reason:  DataTypes.STRING(120),
    // loss | return — qué se hizo con el faltante al resolver la diferencia.
    diff_resolution: DataTypes.STRING(20),
    resolved_at:  DataTypes.DATE,
  }, {
    sequelize,
    tableName: 'stock_transfer_items',
    modelName: 'StockTransferItem',
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return StockTransferItem;
};
