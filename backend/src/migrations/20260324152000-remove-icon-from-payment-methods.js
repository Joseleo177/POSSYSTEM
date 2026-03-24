'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn('payment_methods', 'icon');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('payment_methods', 'icon', {
      type: Sequelize.STRING(10),
      defaultValue: ''
    });
  }
};
