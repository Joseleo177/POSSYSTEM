'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Agregar columna is_combo a products
    await queryInterface.addColumn('products', 'is_combo', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // 2. Crear tabla pivote product_combo_items
    await queryInterface.createTable('product_combo_items', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      combo_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT' // No puedes borrar un producto si es ingrediente de un combo activo
      },
      quantity: {
        type: Sequelize.NUMERIC(10, 3),
        allowNull: false,
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('product_combo_items');
    await queryInterface.removeColumn('products', 'is_combo');
  }
};
