'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmployeeWarehouse extends Model {
    static associate(models) {
      EmployeeWarehouse.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      EmployeeWarehouse.belongsTo(models.Warehouse, { foreignKey: 'warehouse_id' });
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
    }
  }, {
    sequelize,
    tableName: 'employee_warehouses',
    modelName: 'EmployeeWarehouse',
    timestamps: false
  });
  return EmployeeWarehouse;
};
