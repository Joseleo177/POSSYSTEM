'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class IncomeCategory extends Model {
    static associate(models) {
      IncomeCategory.hasMany(models.Income, { foreignKey: 'category_id', as: 'incomes' });
    }
  }
  IncomeCategory.init({
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:       { type: DataTypes.STRING(100), allowNull: false },
    active:     { type: DataTypes.BOOLEAN, defaultValue: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    tableName: 'income_categories',
    modelName: 'IncomeCategory',
    timestamps: false,
  });
  return IncomeCategory;
};
