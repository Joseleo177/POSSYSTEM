'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('income_categories', {
      id:     { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name:   { type: Sequelize.STRING(100), allowNull: false },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      company_id: { type: Sequelize.INTEGER, allowNull: true },
    });

    await queryInterface.bulkInsert('income_categories', [
      { id: 1, name: 'Ventas Externas',         active: true },
      { id: 2, name: 'Transferencia de Cuentas', active: true },
      { id: 3, name: 'Préstamo / Capital',       active: true },
      { id: 4, name: 'Devolución de Proveedor',  active: true },
      { id: 5, name: 'Comisiones',               active: true },
      { id: 6, name: 'Otros',                    active: true },
    ]);

    await queryInterface.createTable('incomes', {
      id:          { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      reference:   { type: Sequelize.STRING(50), allowNull: true },
      description: { type: Sequelize.STRING(255), allowNull: false },
      amount:      { type: Sequelize.DECIMAL(14, 6), allowNull: false },
      currency_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'currencies', key: 'id' } },
      rate:        { type: Sequelize.DECIMAL(14, 6), defaultValue: 1 },
      category_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'income_categories', key: 'id' } },
      payment_journal_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'payment_journals', key: 'id' } },
      employee_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'employees', key: 'id' } },
      company_id:  { type: Sequelize.INTEGER, allowNull: true },
      notes:       { type: Sequelize.TEXT, allowNull: true },
      status:      { type: Sequelize.STRING(20), defaultValue: 'activo' },
      created_at:  { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at:  { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('incomes');
    await queryInterface.dropTable('income_categories');
  },
};
