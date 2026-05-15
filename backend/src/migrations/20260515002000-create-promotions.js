'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('promotions', {
      id:           { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name:         { type: Sequelize.STRING(200), allowNull: false },
      type:         { type: Sequelize.STRING(20),  allowNull: false },
      discount_pct: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      buy_qty:      { type: Sequelize.INTEGER, allowNull: true },
      get_qty:      { type: Sequelize.INTEGER, allowNull: true },
      starts_at:    { type: Sequelize.DATE, allowNull: false },
      ends_at:      { type: Sequelize.DATE, allowNull: true },
      active:       { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      company_id:   { type: Sequelize.INTEGER, allowNull: true },
      created_at:   { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at:   { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.createTable('promotion_products', {
      promotion_id: {
        type: Sequelize.INTEGER, allowNull: false, primaryKey: true,
        references: { model: 'promotions', key: 'id' }, onDelete: 'CASCADE',
      },
      product_id: {
        type: Sequelize.INTEGER, allowNull: false, primaryKey: true,
        references: { model: 'products', key: 'id' }, onDelete: 'CASCADE',
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('promotion_products');
    await queryInterface.dropTable('promotions');
  },
};
