'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── Categorías de egresos ──────────────────────────────────
    await queryInterface.createTable('expense_categories', {
      id:     { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name:   { type: Sequelize.STRING(100), allowNull: false },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
    });

    // Seed de categorías por defecto
    await queryInterface.bulkInsert('expense_categories', [
      { id: 1, name: 'Servicios Básicos', active: true },
      { id: 2, name: 'Alquiler',          active: true },
      { id: 3, name: 'Nómina / Personal', active: true },
      { id: 4, name: 'Impuestos',         active: true },
      { id: 5, name: 'Mantenimiento',     active: true },
      { id: 6, name: 'Transporte',        active: true },
      { id: 7, name: 'Suministros',       active: true },
      { id: 8, name: 'Otros',             active: true },
    ]);

    // ── Egresos ───────────────────────────────────────────────
    await queryInterface.createTable('expenses', {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      reference:  { type: Sequelize.STRING(50), allowNull: true },
      description:{ type: Sequelize.STRING(255), allowNull: false },
      amount:     { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      currency_id:{ type: Sequelize.INTEGER, allowNull: true, references: { model: 'currencies', key: 'id' } },
      rate:       { type: Sequelize.DECIMAL(14, 6), defaultValue: 1 },
      category_id:{ type: Sequelize.INTEGER, allowNull: false, references: { model: 'expense_categories', key: 'id' } },
      payment_journal_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'payment_journals', key: 'id' } },
      employee_id:{ type: Sequelize.INTEGER, allowNull: false, references: { model: 'employees', key: 'id' } },
      notes:      { type: Sequelize.TEXT, allowNull: true },
      status:     { type: Sequelize.STRING(20), defaultValue: 'activo' }, // activo | anulado
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('expenses');
    await queryInterface.dropTable('expense_categories');
  },
};
