'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // is_combo y product_combo_items ya están en la migración initial-schema (20260320000000).
    // Esta migración queda como idempotente para compatibilidad con BDs antiguas.
    try {
      await queryInterface.addColumn('products', 'is_combo', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    } catch (e) {
      if (!e.message.includes('already exists')) throw e;
    }

    try {
      await queryInterface.createTable('product_combo_items', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        combo_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'products', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        product_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'products', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        quantity: {
          type: Sequelize.NUMERIC(10, 3),
          allowNull: false,
        }
      });
    } catch (e) {
      if (!e.message.includes('already exists')) throw e;
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('product_combo_items');
    await queryInterface.removeColumn('products', 'is_combo');
  }
};
