'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Role extends Model {
    static associate(models) {}
  }
  Role.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // Único dentro de la empresa, no en toda la tabla: cada empresa tiene su "cashier".
    name: { type: DataTypes.STRING(50), allowNull: false },
    label: { type: DataTypes.STRING(100), allowNull: false },
    permissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // NULL = plantilla: de ahí se copian los roles de cada empresa nueva.
    company_id: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    sequelize,
    tableName: 'roles',
    modelName: 'Role',
    timestamps: false
  });
  return Role;
};
