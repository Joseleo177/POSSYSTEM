'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stock_sessions', {
      id:           { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      warehouse_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'warehouses', key: 'id' }, onDelete: 'CASCADE' },
      employee_id:  { type: Sequelize.INTEGER, allowNull: true,  references: { model: 'employees',  key: 'id' }, onDelete: 'SET NULL' },
      company_id:   { type: Sequelize.INTEGER, allowNull: true },
      status:       { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'open' },
      opened_at:    { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      closed_at:    { type: Sequelize.DATE, allowNull: true },
      notes:        { type: Sequelize.TEXT, allowNull: true },
      created_at:   { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at:   { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.createTable('stock_session_lines', {
      id:           { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id:   { type: Sequelize.INTEGER, allowNull: false, references: { model: 'stock_sessions', key: 'id' }, onDelete: 'CASCADE' },
      warehouse_id: { type: Sequelize.INTEGER, allowNull: false },
      product_id:   { type: Sequelize.INTEGER, allowNull: false },
      product_name: { type: Sequelize.STRING,  allowNull: false },
      qty_before:   { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      qty_adjusted: { type: Sequelize.DECIMAL(14, 4), allowNull: false },
      qty_after:    { type: Sequelize.DECIMAL(14, 4), allowNull: false },
      type:         { type: Sequelize.STRING(10), allowNull: false },
      reason:       { type: Sequelize.STRING(60), allowNull: true },
      notes:        { type: Sequelize.TEXT, allowNull: true },
      created_at:   { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at:   { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addIndex('stock_sessions',      ['warehouse_id', 'status']);
    await queryInterface.addIndex('stock_sessions',      ['company_id']);
    await queryInterface.addIndex('stock_session_lines', ['session_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('stock_session_lines');
    await queryInterface.dropTable('stock_sessions');
  },
};
