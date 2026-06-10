'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('products', 'price', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('products', 'price', {
      type: Sequelize.DECIMAL(14, 4),
      allowNull: false,
    });
  },
};
