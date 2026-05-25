'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('payments', 'change_given', {
      type: Sequelize.DECIMAL(14, 6),
      allowNull: true,
      defaultValue: null,
    });
    console.log('--- Migración: change_given ampliado a DECIMAL(14,6) ---');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('payments', 'change_given', {
      type: Sequelize.DECIMAL(14, 4),
      allowNull: true,
      defaultValue: null,
    });
  },
};
