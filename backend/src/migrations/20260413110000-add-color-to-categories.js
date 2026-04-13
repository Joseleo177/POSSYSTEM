'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('categories', 'color', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: null,
    });
    console.log('--- Migración: color añadido a categories ---');
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('categories', 'color');
  },
};
