'use strict';

// Si una caja recibe dinero, lo paga o las dos cosas se decide en el DIARIO, no en el método.
//
// Antes lo decía el método de pago (payment_methods.allows_outflow): todo "Pago móvil" podía
// pagar y todo "Punto de venta" solo cobraba. Pero quien recibe o paga es la cuenta concreta:
// con el mismo método, una cuenta puede pagar proveedores y otra servir solo para cobrar.
//
// El backfill copia lo que hoy dice el método de cada diario, así que nada cambia de
// comportamiento hasta que alguien edite un diario. Recibir nace en true para todos: hasta
// ahora todo diario podía cobrar.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('payment_journals', 'allows_inflow', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true,
    });
    await queryInterface.addColumn('payment_journals', 'allows_outflow', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true,
    });

    // Primero el método global (sin empresa) y después el de la empresa, que manda si existe.
    await queryInterface.sequelize.query(`
      UPDATE payment_journals pj SET allows_outflow = pm.allows_outflow
        FROM payment_methods pm
       WHERE pm.code = pj.type AND pm.company_id IS NULL
    `);
    await queryInterface.sequelize.query(`
      UPDATE payment_journals pj SET allows_outflow = pm.allows_outflow
        FROM payment_methods pm
       WHERE pm.code = pj.type AND pm.company_id = pj.company_id
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('payment_journals', 'allows_outflow');
    await queryInterface.removeColumn('payment_journals', 'allows_inflow');
  },
};
