'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Company extends Model {
    static associate(models) {
      // Definir asociaciones aquí si es necesario
    }
  }
  Company.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    tax_id: { type: DataTypes.STRING(50), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    logo_url: { type: DataTypes.STRING(255), allowNull: true },
    plan_name: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Básico' },
    subscription_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Demo' },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    max_users: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'companies',
    modelName: 'Company',
    timestamps: false
  });
  return Company;
};
