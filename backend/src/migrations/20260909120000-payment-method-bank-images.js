'use strict';

// Logo del método de pago y del banco, para la botonera de "Pago Inmediato" y las pantallas
// de configuración.
//
// Guarda lo mismo que categories.image_filename / products.image_filename: el nombre del
// archivo en modo local o la URL completa en Supabase (ver utils/imageStorage.js). Nace en
// null; sin logo se muestra un ícono genérico — no hay imagen por defecto que inventar.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('payment_methods', 'image_filename', {
      type: Sequelize.STRING(500),
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('banks', 'image_filename', {
      type: Sequelize.STRING(500),
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('payment_methods', 'image_filename');
    await queryInterface.removeColumn('banks', 'image_filename');
  }
};
