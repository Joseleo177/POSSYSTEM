'use strict';
const { Model } = require('sequelize');

// Un movimiento del extracto tal como lo trae el banco. `kind` dice qué es según el banco
// (movimiento, comisión, impuesto, interés); `status` si ya se explicó con algo del sistema.
module.exports = (sequelize, DataTypes) => {
  class BankStatementLine extends Model {
    static associate(models) {
      BankStatementLine.belongsTo(models.BankStatement, { foreignKey: 'statement_id' });
      BankStatementLine.hasMany(models.BankReconciliationMatch, { foreignKey: 'line_id', as: 'matches' });
    }
  }
  BankStatementLine.init({
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:   { type: DataTypes.INTEGER, allowNull: true },
    statement_id: { type: DataTypes.INTEGER, allowNull: false },
    line_no:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    date:         { type: DataTypes.DATEONLY, allowNull: false },
    description:  { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    reference:    { type: DataTypes.STRING(100), allowNull: true },
    debit:        { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    credit:       { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    balance:      { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    kind:         { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'movimiento' },
    status:       { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pendiente' },
    match_mode:   { type: DataTypes.STRING(20), allowNull: true },
    difference:   { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    note:         { type: DataTypes.STRING(255), allowNull: true },
    resolved_by:  { type: DataTypes.INTEGER, allowNull: true },
    resolved_at:  { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize,
    tableName: 'bank_statement_lines',
    modelName: 'BankStatementLine',
    timestamps: false,
  });
  return BankStatementLine;
};
