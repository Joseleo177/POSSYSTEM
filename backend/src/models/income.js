'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Income extends Model {
    static associate(models) {
      Income.belongsTo(models.IncomeCategory, { foreignKey: 'category_id', as: 'category' });
      Income.belongsTo(models.PaymentJournal,  { foreignKey: 'payment_journal_id', as: 'journal' });
      Income.belongsTo(models.Employee,         { foreignKey: 'employee_id', as: 'employee' });
      Income.belongsTo(models.Currency,         { foreignKey: 'currency_id', as: 'currency' });
    }
  }
  Income.init({
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reference:   { type: DataTypes.STRING(50), allowNull: true },
    description: { type: DataTypes.STRING(255), allowNull: false },
    amount:      { type: DataTypes.DECIMAL(14, 6), allowNull: false },
    currency_id: { type: DataTypes.INTEGER, allowNull: true },
    rate:        { type: DataTypes.DECIMAL(14, 6), defaultValue: 1 },
    category_id: { type: DataTypes.INTEGER, allowNull: false },
    payment_journal_id: { type: DataTypes.INTEGER, allowNull: true },
    employee_id: { type: DataTypes.INTEGER, allowNull: false },
    company_id:  { type: DataTypes.INTEGER, allowNull: true },
    notes:       { type: DataTypes.TEXT, allowNull: true },
    status:      { type: DataTypes.STRING(20), defaultValue: 'activo' },
  }, {
    sequelize,
    tableName: 'incomes',
    modelName: 'Income',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return Income;
};
