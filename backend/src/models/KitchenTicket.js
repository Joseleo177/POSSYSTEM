'use strict';
const { Model } = require('sequelize');

// Comanda: una ronda enviada a cocina, con sus propias líneas (KitchenTicketItem). Ver
// migración 20261031120000-comandas.
module.exports = (sequelize, DataTypes) => {
  class KitchenTicket extends Model {}
  KitchenTicket.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: true },
    sale_id:      { type: DataTypes.INTEGER, allowNull: false },
    warehouse_id: { type: DataTypes.INTEGER, allowNull: true },
    table_id:     { type: DataTypes.INTEGER, allowNull: true },
    waiter_id:    { type: DataTypes.INTEGER, allowNull: true },
    round_no:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    label:        { type: DataTypes.STRING(120), allowNull: true },
    note:         { type: DataTypes.STRING(300), allowNull: true },
    status:       { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'nueva' },
    status_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    ready_at:     { type: DataTypes.DATE, allowNull: true },
    created_at:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'kitchen_tickets',
    modelName: 'KitchenTicket',
    timestamps: false,
  });
  return KitchenTicket;
};
