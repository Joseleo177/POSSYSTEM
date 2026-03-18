'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Customer extends Model {
    static associate(models) {}
  }
  Customer.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'cliente' },
    name: { type: DataTypes.STRING(200), allowNull: false },
    phone: { type: DataTypes.STRING(20) },
    email: { type: DataTypes.STRING(150), unique: true },
    address: { type: DataTypes.TEXT },
    rif: { type: DataTypes.STRING(15), unique: true },
    tax_name: { type: DataTypes.STRING(200) },
    tax_regime: { type: DataTypes.STRING(100) },
    notes: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'customers',
    modelName: 'Customer',
    timestamps: false
  });
  return Customer;
};
