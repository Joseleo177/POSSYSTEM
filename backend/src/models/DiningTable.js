'use strict';
const { Model } = require('sequelize');

// Mesa de un área. x, y, w, h son celdas de una cuadrícula de 40 × 24: el plano se dibuja a
// cualquier tamaño de pantalla sin guardar píxeles. Ver migración 20261031110000-mesas.
module.exports = (sequelize, DataTypes) => {
  class DiningTable extends Model {}
  DiningTable.init({
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    area_id:    { type: DataTypes.INTEGER, allowNull: false },
    name:       { type: DataTypes.STRING(20), allowNull: false },
    seats:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
    shape:      { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'square' },
    x:          { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    y:          { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    w:          { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
    h:          { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
    // Giro en grados (0, 45, 90, 135); w y h ya son la huella girada.
    rotation:   { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    active:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Código del QR de la mesa (/mesa/<código>): al azar, no el id. Ver migración
    // 20261101120000-mesa-qr y services/mesaPublica.js.
    public_token: { type: DataTypes.STRING(32), allowNull: true, defaultValue: () => require('crypto').randomBytes(15).toString('base64url') },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'dining_tables',
    modelName: 'DiningTable',
    timestamps: false,
  });
  return DiningTable;
};
