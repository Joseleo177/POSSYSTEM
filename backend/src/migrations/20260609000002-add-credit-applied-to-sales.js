'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'credit_applied', {
      type: Sequelize.DECIMAL(14, 6),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales', 'credit_applied');
  },
};
