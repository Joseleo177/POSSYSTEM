'use strict';

// Distingue el almacén que atiende público del que solo guarda mercancía.
//
// Una sucursal puede tener dos: la tienda (piso de venta) y el depósito. Ambos llevan stock,
// se transfieren entre sí y entran en los reportes, pero desde el depósito no se factura: no
// tiene caja ni serie, y ofrecerlo en el POS solo lleva a vender por error contra el stock
// equivocado.
//
// Los almacenes existentes quedan vendiendo, que es como venían funcionando.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('warehouses', 'sells', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('warehouses', 'sells');
  },
};