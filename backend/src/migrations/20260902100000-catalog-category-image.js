'use strict';

// Foto de la categoría, para la sección "Nuestras categorías" de la vitrina.
//
// Guarda lo mismo que products.image_filename: el nombre del archivo en modo local o la URL
// completa en Supabase (ver utils/imageStorage.js). Nace en null y la categoría se muestra
// sin foto mientras no se le cargue una — no hay imagen por defecto que inventar.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('categories', 'image_filename', {
      type: Sequelize.STRING(500),
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('categories', 'image_filename');
  }
};
