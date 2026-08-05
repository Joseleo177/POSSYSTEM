'use strict';

// Datos de contacto de un pedido hecho desde el catálogo público. No se crea un Customer
// por cada pedido: la mayoría son gente que compra una vez, y llenar la cartera de
// clientes con ellos ensucia listados, reportes y búsquedas. Cuando el comercio quiera
// registrarlo de verdad, lo hace desde el cobro como con cualquier cliente nuevo.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('sales', 'web_customer_name',  { type: Sequelize.STRING(120), allowNull: true });
    await queryInterface.addColumn('sales', 'web_customer_phone', { type: Sequelize.STRING(30),  allowNull: true });
    await queryInterface.addColumn('sales', 'web_note',           { type: Sequelize.TEXT,        allowNull: true });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('sales', 'web_customer_name');
    await queryInterface.removeColumn('sales', 'web_customer_phone');
    await queryInterface.removeColumn('sales', 'web_note');
  }
};
