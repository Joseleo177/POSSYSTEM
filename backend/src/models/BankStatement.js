'use strict';
const { Model } = require('sequelize');

// Extracto bancario subido para conciliar. La cuenta es el par banco + moneda (ver
// services/bankReconciliation/accounts.js); la sucursal es opcional y recorta los diarios.
module.exports = (sequelize, DataTypes) => {
  class BankStatement extends Model {
    static associate(models) {
      BankStatement.hasMany(models.BankStatementLine, { foreignKey: 'statement_id', as: 'lines' });
      BankStatement.belongsTo(models.Bank,      { foreignKey: 'bank_id' });
      BankStatement.belongsTo(models.Currency,  { foreignKey: 'currency_id' });
      BankStatement.belongsTo(models.Warehouse, { foreignKey: 'warehouse_id' });
      BankStatement.belongsTo(models.Employee,  { foreignKey: 'employee_id' });
    }
  }
  BankStatement.init({
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:      { type: DataTypes.INTEGER, allowNull: true },
    // La cuenta conciliada. bank_id/currency_id quedan como copia para listar.
    journal_id:      { type: DataTypes.INTEGER, allowNull: true },
    bank_id:         { type: DataTypes.INTEGER, allowNull: false },
    currency_id:     { type: DataTypes.INTEGER, allowNull: true },
    warehouse_id:    { type: DataTypes.INTEGER, allowNull: true },
    bank_format:     { type: DataTypes.STRING(40), allowNull: true },
    filename:        { type: DataTypes.STRING(255), allowNull: true },
    date_from:       { type: DataTypes.DATEONLY, allowNull: true },
    date_to:         { type: DataTypes.DATEONLY, allowNull: true },
    opening_balance: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    closing_balance: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    employee_id:     { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    tableName: 'bank_statements',
    modelName: 'BankStatement',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return BankStatement;
};
