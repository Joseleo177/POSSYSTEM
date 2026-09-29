'use strict';

// Pago conjunto a proveedor: una sola transferencia salda varias compras.
//
// Igual que en el cobro conjunto de ventas, cada compra conserva su propio pago —es lo que
// dice cuánto de ESA factura se saldó—, pero del banco salió un solo movimiento. Los pagos del
// mismo acto comparten `batch_id` y cuelgan de UN egreso con referencia
// `purchase_batch:<batch_id>`, en vez de uno por pago (`purchase_payment:<id>`). Así el estado
// de cuenta de la caja muestra una línea por el monto real transferido.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('purchase_payments', 'batch_id', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addIndex('purchase_payments', ['batch_id'], { name: 'purchase_payments_batch_id_idx' });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('purchase_payments', 'purchase_payments_batch_id_idx');
    await queryInterface.removeColumn('purchase_payments', 'batch_id');
  }
};
