'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Warehouse extends Model {
    static associate(models) {}
  }
  Warehouse.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    description: { type: DataTypes.TEXT },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // false = depósito: guarda mercancía pero no atiende público, así que no se factura
    // desde él ni aparece en el selector de la caja.
    sells: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Vincula un depósito (sells=false) con su almacén principal / sucursal.
    // Solo informativo por ahora: ayuda a organizar la estructura.
    parent_warehouse_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // Ubicación de la sucursal: desde aquí se mide el delivery de los pedidos del catálogo.
    lat: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    lng: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'warehouses',
    modelName: 'Warehouse',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['name', 'company_id']
      }
    ]
  });
  return Warehouse;
};
