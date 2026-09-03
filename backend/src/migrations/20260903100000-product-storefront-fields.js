'use strict';

// Campos de vitrina del producto: los que las tiendas de marca ponen en cada tarjeta y que
// el sistema no tenía porque nacieron de un inventario, no de un escaparate.
//
//   brand             la línea o marca del producto, encima del nombre
//   short_description  la frase de beneficio debajo ("Hidratación profunda, 48h")
//
// Los dos son opcionales y solo los lee el catálogo público. Un producto sin ellos se ve
// como se veía: imagen, nombre y precio. No participan en la venta ni en el inventario, así
// que ningún producto existente necesita que se le llene nada.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('products', 'brand', {
      type: Sequelize.STRING(80),
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('products', 'short_description', {
      type: Sequelize.STRING(200),
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('products', 'brand');
    await queryInterface.removeColumn('products', 'short_description');
  }
};
