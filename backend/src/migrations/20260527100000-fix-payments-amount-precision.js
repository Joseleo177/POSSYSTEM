"use strict";

// payments.amount was NUMERIC(10,2) — base-currency amounts from foreign-currency
// transactions (e.g. Bs.25000 / 530.5047 = 47.124934) were rounded to 47.12,
// causing round-trip display errors (47.12 × 530.5047 = 24997.38 ≠ 25000).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("payments", "amount", {
      type: Sequelize.DECIMAL(14, 6),
      allowNull: false,
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("payments", "amount", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
    });
  },
};
