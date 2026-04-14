'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ExpenseCategory extends Model {
    static associate(models) {
      ExpenseCategory.hasMany(models.Expense, { foreignKey: 'category_id', as: 'expenses' });
    }
  }
  ExpenseCategory.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    sequelize,
    tableName: 'expense_categories',
    modelName: 'ExpenseCategory',
    timestamps: false
  });
  return ExpenseCategory;
};
