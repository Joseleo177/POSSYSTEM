'use strict';

// Nota por línea de pedido ("sin cebolla", "extra salsa"), distinta de sales.web_note —que
// es una nota del pedido entero, la de "dirección, hora, retiro en tienda"—. Con dos platos
// iguales pero notas distintas, la comanda tiene que poder distinguir cuál lleva qué.
//
// Sirve tanto al pedido del catálogo público como a una venta armada en caja: es una columna
// de sale_items, no algo exclusivo del tema de menú.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('sale_items', 'note', {
      type: Sequelize.STRING(200),
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('sale_items', 'note');
  }
};
