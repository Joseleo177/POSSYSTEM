'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('customers', 'credit_balance', {
      type: Sequelize.DECIMAL(14, 6),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('customers', 'credit_balance');
  },
};
