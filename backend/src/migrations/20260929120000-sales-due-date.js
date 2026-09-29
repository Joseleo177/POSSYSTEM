'use strict';

// Cuentas por cobrar: vencimiento de cada factura.
//
//   sales.due_date — vencimiento pactado a mano para ESA factura. Nulo = fecha de la factura
//                    más los días de crédito del cliente (customers.credit_days), calculado al
//                    leer. Misma regla que purchases.due_date (ver utils/dueDate.js).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('sales', 'due_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('sales', 'due_date');
  }
};
