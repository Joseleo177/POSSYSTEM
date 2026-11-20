'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Employee extends Model {
    static associate(models) {}
  }
  Employee.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    // PIN rápido (4–6 dígitos, bcrypt) para autorizar medicamentos controlados en caja (Farmacia).
    approval_pin_hash: { type: DataTypes.STRING(255), allowNull: true },
    full_name: { type: DataTypes.STRING(200), allowNull: false },
    email: { type: DataTypes.STRING(150), unique: true },
    phone: { type: DataTypes.STRING(20) },
    role_id: { type: DataTypes.INTEGER, allowNull: false },
    // Diferencias de esta persona con su rol: true da, false quita (ver effectivePermissions).
    permission_overrides: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    is_superuser: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Entró con una contraseña que no cumple la regla (utils/passwordPolicy.js): hasta cambiarla
    // el servidor solo le deja hacer eso (middleware/auth.js).
    must_change_password: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Versión de sus sesiones: va en el token y subirla las cierra todas (migración 20261125110000).
    token_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // Los escribe utils/loginEvents.js; nadie más los toca.
    last_login_at: { type: DataTypes.DATE, allowNull: true },
    last_seen_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'employees',
    modelName: 'Employee',
    timestamps: false
  });
  return Employee;
};
