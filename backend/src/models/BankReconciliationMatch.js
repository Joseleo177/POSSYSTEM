'use strict';
const { Model } = require('sequelize');

// Qué documento del sistema explica una línea del extracto. Un cobro conjunto deja una fila
// por cada Payment del lote; un lote del punto de venta, una por cada cobro que lo forma.
// role 'creado' = el documento lo generó la conciliación (comisión, movimiento registrado).
module.exports = (sequelize, DataTypes) => {
  class BankReconciliationMatch extends Model {
    static associate(models) {
      BankReconciliationMatch.belongsTo(models.BankStatementLine, { foreignKey: 'line_id' });
    }
  }
  BankReconciliationMatch.init({
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id:  { type: DataTypes.INTEGER, allowNull: true },
    line_id:     { type: DataTypes.INTEGER, allowNull: false },
    source_type: { type: DataTypes.STRING(20), allowNull: false },
    source_id:   { type: DataTypes.INTEGER, allowNull: false },
    role:        { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'documento' },
    amount:      { type: DataTypes.DECIMAL(18, 6), allowNull: false, defaultValue: 0 },
    created_at:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize,
    tableName: 'bank_reconciliation_matches',
    modelName: 'BankReconciliationMatch',
    timestamps: false,
  });
  return BankReconciliationMatch;
};
