'use strict';
const { Model } = require('sequelize');

// Línea de una comanda. El nombre se copia al enviar: la comanda dice lo que se pidió aunque
// después cambien el producto o la cuenta.
module.exports = (sequelize, DataTypes) => {
  class KitchenTicketItem extends Model {}
  KitchenTicketItem.init({
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ticket_id:  { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER, allowNull: true },
    name:       { type: DataTypes.STRING(255), allowNull: false },
    quantity:   { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    note:       { type: DataTypes.STRING(200), allowNull: true },
    // Adicionales elegidos, para la cocina: "Término medio · Sin cebolla · + Queso extra".
    modifiers:  { type: DataTypes.STRING(400), allowNull: true },
  }, {
    sequelize,
    tableName: 'kitchen_ticket_items',
    modelName: 'KitchenTicketItem',
    timestamps: false,
  });
  return KitchenTicketItem;
};
