'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('warehouses', 'parent_warehouse_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    await queryInterface.addIndex('warehouses', ['parent_warehouse_id'], {
      name: 'idx_warehouses_parent',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('warehouses', 'idx_warehouses_parent');
    await queryInterface.removeColumn('warehouses', 'parent_warehouse_id');
  },
};
