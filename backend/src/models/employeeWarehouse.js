'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmployeeWarehouse extends Model {
    static associate(models) {
      // Associations are managed in models/index.js
    }
  }
  EmployeeWarehouse.init({
    employee_id: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    warehouse_id: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'employee_warehouses',
    modelName: 'EmployeeWarehouse',
    timestamps: false
  });
  return EmployeeWarehouse;
};
