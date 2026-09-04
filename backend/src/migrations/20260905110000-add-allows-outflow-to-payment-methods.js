'use strict';

// Un método de pago puede recibir dinero sin poder enviarlo: un terminal de Punto de Venta
// cobra tarjetas de clientes, pero nadie le "paga a una persona" con un POS. Este flag deja
// que Egresos y pagos a proveedores filtren los diarios casados a métodos que solo entran.
//
// Nace en true para todos: lo normal es que un método sirva para ambos sentidos. Punto de
// Venta es la única excepción conocida, así que el backfill lo apaga explícitamente por code
// (mismo patrón que CASH_CODE en defaultPaymentMethods.js) en vez de dejarlo en el default.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('payment_methods', 'allows_outflow', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE payment_methods SET allows_outflow = false WHERE code = 'punto_venta'
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('payment_methods', 'allows_outflow');
  }
};
