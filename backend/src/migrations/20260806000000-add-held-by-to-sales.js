'use strict';

// Bloqueo de cuentas en espera. Hasta ahora, cuando una caja recuperaba una cuenta solo la
// ocultaba de su propia lista: en el servidor seguía en 'espera' y cualquier otra caja podía
// tomarla o eliminarla en paralelo, dejando al primer cajero con un carrito armado y una
// venta que ya no existía.
//
// held_at no es solo informativo: es lo que permite soltar el bloqueo por tiempo cuando el
// cajero abandona sin cerrar (navegador cerrado, corte de luz), sin lo cual la cuenta
// quedaría trabada para siempre.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'held_by_employee_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('sales', 'held_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    // La lista de cuentas en espera se consulta en cada carga del POS y consulta por este
    // par de columnas para resolver quién tiene cada cuenta.
    await queryInterface.addIndex('sales', ['held_by_employee_id'], {
      name: 'sales_held_by_employee_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('sales', 'sales_held_by_employee_id_idx');
    await queryInterface.removeColumn('sales', 'held_at');
    await queryInterface.removeColumn('sales', 'held_by_employee_id');
  },
};