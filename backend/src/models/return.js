'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Return extends Model {
    static associate(models) {}
  }
  Return.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sale_id: { type: DataTypes.INTEGER, allowNull: false },
    employee_id: { type: DataTypes.INTEGER },
    reason: { type: DataTypes.STRING(500) },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'returns',
    modelName: 'Return',
    timestamps: false
  });
  return Return;
};
