'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // La columna 'icon' ya fue removida del schema inicial (20260320000000).
    // Esta migración es idempotente para compatibilidad con BDs antiguas.
    try {
      await queryInterface.removeColumn('payment_methods', 'icon');
    } catch (e) {
      if (!e.message.includes('does not exist')) throw e;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('payment_methods', 'icon', {
        type: Sequelize.STRING(10),
        defaultValue: ''
      });
    } catch (e) {
      if (!e.message.includes('already exists')) throw e;
    }
  }
};
