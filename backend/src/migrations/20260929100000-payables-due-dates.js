'use strict';

// Cuentas por pagar: de cuándo vence cada compra.
//
//   customers.credit_days — días de crédito que da el proveedor (o que se le da al cliente).
//                           Nulo = de contado: la compra vence el mismo día.
//   purchases.due_date    — vencimiento fijado a mano para ESA compra. Nulo = se calcula al
//                           leer: fecha de la compra + días de crédito del proveedor. Así las
//                           compras viejas quedan cubiertas sin migrar datos, y solo se guarda
//                           cuando alguien pactó una fecha distinta para una factura concreta.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('customers', 'credit_days', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('purchases', 'due_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('purchases', 'due_date');
    await queryInterface.removeColumn('customers', 'credit_days');
  }
};
