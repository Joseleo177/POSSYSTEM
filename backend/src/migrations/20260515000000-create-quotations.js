'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('quotations', {
      id:               { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      customer_id:      { type: Sequelize.INTEGER, allowNull: true, references: { model: 'customers', key: 'id' } },
      customer_name:    { type: Sequelize.STRING(255), allowNull: true },
      customer_rif:     { type: Sequelize.STRING(50), allowNull: true },
      employee_id:      { type: Sequelize.INTEGER, allowNull: true, references: { model: 'employees', key: 'id' } },
      warehouse_id:     { type: Sequelize.INTEGER, allowNull: true, references: { model: 'warehouses', key: 'id' } },
      currency_id:      { type: Sequelize.INTEGER, allowNull: true, references: { model: 'currencies', key: 'id' } },
      exchange_rate:    { type: Sequelize.DECIMAL(14, 6), defaultValue: 1 },
      discount_amount:  { type: Sequelize.DECIMAL(14, 2), defaultValue: 0 },
      subtotal:         { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      total:            { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      status:           { type: Sequelize.STRING(20), defaultValue: 'pendiente' }, // pendiente | convertida | anulada
      notes:            { type: Sequelize.TEXT, allowNull: true },
      converted_sale_id:{ type: Sequelize.INTEGER, allowNull: true, references: { model: 'sales', key: 'id' } },
      company_id:       { type: Sequelize.INTEGER, allowNull: true },
      created_at:       { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at:       { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('quotation_items', {
      id:           { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      quotation_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'quotations', key: 'id' }, onDelete: 'CASCADE' },
      product_id:   { type: Sequelize.INTEGER, allowNull: true, references: { model: 'products', key: 'id' } },
      product_name: { type: Sequelize.STRING(255), allowNull: false },
      quantity:     { type: Sequelize.DECIMAL(14, 4), allowNull: false },
      price:        { type: Sequelize.DECIMAL(14, 4), allowNull: false },
      subtotal:     { type: Sequelize.DECIMAL(14, 2), allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('quotation_items');
    await queryInterface.dropTable('quotations');
  },
};
