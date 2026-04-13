'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('product_lots', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      warehouse_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'warehouses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      lot_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      expiration_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      qty: {
        type: Sequelize.DECIMAL(10, 3),
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('product_lots', ['product_id', 'warehouse_id'], { name: 'idx_product_lots_product_warehouse' });
    await queryInterface.addIndex('product_lots', ['expiration_date'], { name: 'idx_product_lots_expiry' });
    await queryInterface.addIndex('product_lots', ['lot_number'], { name: 'idx_product_lots_lot' });

    console.log('--- Migración: tabla product_lots creada ---');
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('product_lots');
  },
};
