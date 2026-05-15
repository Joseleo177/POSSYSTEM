'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Quotation extends Model {
    static associate(models) {}
  }
  Quotation.init({
    id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    customer_id:       { type: DataTypes.INTEGER, allowNull: true },
    customer_name:     { type: DataTypes.STRING(255), allowNull: true },
    customer_rif:      { type: DataTypes.STRING(50), allowNull: true },
    employee_id:       { type: DataTypes.INTEGER, allowNull: true },
    warehouse_id:      { type: DataTypes.INTEGER, allowNull: true },
    currency_id:       { type: DataTypes.INTEGER, allowNull: true },
    exchange_rate:     { type: DataTypes.DECIMAL(14, 6), defaultValue: 1 },
    discount_amount:   { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    subtotal:          { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    total:             { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    status:            { type: DataTypes.STRING(20), defaultValue: 'pendiente' },
    notes:             { type: DataTypes.TEXT, allowNull: true },
    converted_sale_id: { type: DataTypes.INTEGER, allowNull: true },
    company_id:        { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    tableName: 'quotations',
    modelName: 'Quotation',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return Quotation;
};
