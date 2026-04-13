'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('purchase_items', 'lot_number', {
      type: Sequelize.STRING(100),
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('purchase_items', 'expiration_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
      defaultValue: null,
    });
    console.log('--- Migración: lot_number y expiration_date añadidos a purchase_items ---');
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('purchase_items', 'lot_number');
    await queryInterface.removeColumn('purchase_items', 'expiration_date');
  },
};
