'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('products', 'is_service', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
    } catch (e) {
      // La columna ya existe en la migración inicial (20260320000000), ignorar
      if (!e.message.includes('already exists')) throw e;
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('products', 'is_service');
  }
};
