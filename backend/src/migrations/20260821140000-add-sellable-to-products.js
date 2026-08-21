'use strict';

// Distingue el producto que se vende del insumo que solo se consume.
//
// En un restaurante buena parte del inventario nunca se vende suelto: la harina, el aceite o
// la carne cruda entran por compras, se descuentan al armar un plato y no deberían poder
// cobrarse en caja ni aparecer en el catálogo. Hasta ahora no había forma de decirlo, así que
// un insumo se podía vender por error desde el POS.
//
// Los productos existentes quedan vendibles, que es como venían funcionando.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'sellable', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('products', 'sellable');
  },
};