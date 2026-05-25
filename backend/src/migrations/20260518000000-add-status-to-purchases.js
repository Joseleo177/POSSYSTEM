'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('purchases', 'status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'recibido', // compras existentes ya tienen stock actualizado
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('purchases', 'status');
  },
};
