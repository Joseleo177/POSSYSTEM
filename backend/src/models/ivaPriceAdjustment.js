'use strict';
const { Model } = require('sequelize');

// Un ajuste de precios con IVA (sumar o quitar el impuesto a los precios de venta) con el antes y el
// después de cada precio, para deshacerlo exacto. Ver services/fiscal/preciosIva.js y la migración
// 20261120100000-ajuste-precios-iva.
module.exports = (sequelize, DataTypes) => {
  class IvaPriceAdjustment extends Model {
    static associate(models) {}
  }
  IvaPriceAdjustment.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    direccion: { type: DataTypes.STRING(6), allowNull: false },
    redondeo: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'exacto' },
    alcance: { type: DataTypes.JSONB, allowNull: true },
    productos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    cambios: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    deshecho_at: { type: DataTypes.DATE, allowNull: true },
    deshecho_by: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    tableName: 'iva_price_adjustments',
    modelName: 'IvaPriceAdjustment',
    timestamps: false,
  });
  return IvaPriceAdjustment;
};
