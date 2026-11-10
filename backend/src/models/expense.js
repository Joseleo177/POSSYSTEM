'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Expense extends Model {
    static associate(models) {
      Expense.belongsTo(models.ExpenseCategory, { foreignKey: 'category_id', as: 'category' });
      Expense.belongsTo(models.PaymentJournal,  { foreignKey: 'payment_journal_id', as: 'journal' });
      Expense.belongsTo(models.Employee,         { foreignKey: 'employee_id', as: 'employee' });
      Expense.belongsTo(models.Currency,         { foreignKey: 'currency_id', as: 'currency' });
      Expense.belongsTo(models.Warehouse,        { foreignKey: 'warehouse_id', as: 'warehouse' });
    }
  }
  Expense.init({
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reference:   { type: DataTypes.STRING(50), allowNull: true },
    description: { type: DataTypes.STRING(255), allowNull: false },
    amount:      { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    currency_id: { type: DataTypes.INTEGER, allowNull: true },
    rate:        { type: DataTypes.DECIMAL(14, 6), defaultValue: 1 },
    category_id: { type: DataTypes.INTEGER, allowNull: false },
    payment_journal_id: { type: DataTypes.INTEGER, allowNull: true },
    // Por qué método de la cuenta entró o salió el dinero (pago móvil, punto...). El diario
    // es la cuenta; el método se completa y se valida en el hook de models/index.js.
    payment_method: { type: DataTypes.STRING(30), allowNull: true },
    employee_id: { type: DataTypes.INTEGER, allowNull: false },
    company_id:  { type: DataTypes.INTEGER, allowNull: true },
    // Sucursal a la que pertenece el movimiento. Nullable por los registros históricos.
    warehouse_id: { type: DataTypes.INTEGER, allowNull: true },
    // Parte de un avance de efectivo (ver models/cashAdvance.js): se anula junto con él.
    cash_advance_id: { type: DataTypes.INTEGER, allowNull: true },
    // Parte de una liquidación de Cashea (ver models/CasheaSettlement.js): se anula junto con ella.
    cashea_settlement_id: { type: DataTypes.INTEGER, allowNull: true },
    notes:       { type: DataTypes.TEXT, allowNull: true },
    status:      { type: DataTypes.STRING(20), defaultValue: 'activo' },
    date:        { type: DataTypes.DATE, allowNull: true },
    // Gasto con factura fiscal (luz, alquiler): entra al Libro de compras. El número de la factura
    // va aparte de `reference`, que también guarda claves internas de los pagos a proveedores.
    fiscal:         { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    supplier_rif:   { type: DataTypes.STRING(20), allowNull: true },
    supplier_name:  { type: DataTypes.STRING(200), allowNull: true },
    invoice_number: { type: DataTypes.STRING(40), allowNull: true },
    control_number: { type: DataTypes.STRING(40), allowNull: true },
    invoice_date:   { type: DataTypes.DATEONLY, allowNull: true },
    iva_rate:       { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    // IVA en la moneda del gasto (amount × rate), que es la del papel del proveedor.
    iva_amount:     { type: DataTypes.DECIMAL(14, 6), allowNull: false, defaultValue: 0 },
    // Total del papel tal como lo escribió quien cargó el gasto, en su moneda. `amount` va en base
    // con dos decimales y, devuelto a bolívares, puede no dar exacto lo que dice la factura.
    invoice_total:  { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  }, {
    sequelize,
    tableName: 'expenses',
    modelName: 'Expense',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });
  return Expense;
};
