'use strict';

// Visibilidad en el catálogo público. Arranca en false a propósito: publicar el
// inventario completo de golpe no es una decisión que deba tomar una migración, así que
// el comercio elige explícitamente qué sale a la vitrina (hay acción masiva en el
// catálogo para hacerlo de a decenas). Los productos nuevos también nacen ocultos.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('products', 'visible_in_catalog', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('products', 'visible_in_catalog');
  }
};
