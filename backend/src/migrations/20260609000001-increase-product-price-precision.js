'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('products', 'price', {
      type: Sequelize.DECIMAL(14, 4),
      allowNull: false,
    });
    await queryInterface.changeColumn('products', 'cost_price', {
      type: Sequelize.DECIMAL(14, 4),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('products', 'price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn('products', 'cost_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },
};
