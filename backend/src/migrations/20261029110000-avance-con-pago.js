'use strict';

// El avance de efectivo que va junto a un cobro sale en el MISMO pase del punto que la factura:
// el banco muestra una sola línea por la suma. payment_id ata el avance a su cobro para que la
// conciliación bancaria los trate como una sola unidad (bankReconciliation/candidates.js).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('cash_advances', 'payment_id', { type: Sequelize.INTEGER, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('cash_advances', 'payment_id');
  },
};
