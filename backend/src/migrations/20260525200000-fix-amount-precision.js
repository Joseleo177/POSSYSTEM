"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("purchase_payments", "amount", {
      type: Sequelize.DECIMAL(14, 6),
      allowNull: false,
    });
    await queryInterface.changeColumn("expenses", "amount", {
      type: Sequelize.DECIMAL(14, 6),
      allowNull: false,
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("purchase_payments", "amount", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn("expenses", "amount", {
      type: Sequelize.DECIMAL(14, 2),
      allowNull: false,
    });
  },
};
