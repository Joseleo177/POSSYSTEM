'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('return_items');
    if (!tableInfo.sale_item_id) {
      await queryInterface.addColumn('return_items', 'sale_item_id', {
        type: Sequelize.INTEGER,
        references: { model: 'sale_items', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        allowNull: true
      });
    }

    // 2. Opcional: Crear índice para rapidez en consultas de devoluciones
    await queryInterface.addIndex('return_items', ['sale_item_id']);

    console.log('--- Migración: Añadido sale_item_id a return_items ---');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('return_items', 'sale_item_id');
  }
};
