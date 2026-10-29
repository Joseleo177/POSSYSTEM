'use strict';
const { Model } = require('sequelize');

// Zona de reparto del catálogo con su precio en moneda base ("Centro", "Este"). La elige el
// cliente al pedir delivery y su precio entra como recargo de la venta. warehouse_id NULL =
// la ofrecen todas las sucursales. Ver la migración 20261101150000-pedidos-web-entrega-pago.
module.exports = (sequelize, DataTypes) => {
  class DeliveryZone extends Model {}
  DeliveryZone.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: false },
    warehouse_id: { type: DataTypes.INTEGER, allowNull: true },
    name:         { type: DataTypes.STRING(80), allowNull: false },
    price:        { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    active:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sort_order:   { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at:   { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'delivery_zones',
    modelName: 'DeliveryZone',
    timestamps: false,
  });
  return DeliveryZone;
};
