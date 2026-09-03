'use strict';

// La frase corta bajo el nombre de la categoría ("SHAWARMAS Y PEPI SHAWARMAS", "PAN DE 30 CM
// CON PAPAS"), que el tema de menú usa en cada mosaico de "Tipos de comida". Opcional: sin
// ella la tarjeta se ve con nombre y foto nada más, como cualquier categoría hoy.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('categories', 'short_description', {
      type: Sequelize.STRING(160),
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('categories', 'short_description');
  }
};
