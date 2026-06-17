'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('purchase_items', 'package_price', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
    });
    await queryInterface.changeColumn('purchase_items', 'unit_cost', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
    });
    await queryInterface.changeColumn('purchase_items', 'sale_price', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
    });
    await queryInterface.changeColumn('purchase_items', 'subtotal', {
      type: Sequelize.DECIMAL(14, 5),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('purchase_items', 'package_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn('purchase_items', 'unit_cost', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn('purchase_items', 'sale_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn('purchase_items', 'subtotal', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
    });
  },
};
