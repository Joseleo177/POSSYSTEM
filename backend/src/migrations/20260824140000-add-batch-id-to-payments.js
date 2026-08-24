'use strict';

// Marca de "esto entró junto" en los cobros.
//
// Un cobro conjunto reparte un solo monto entre varias facturas y registra un Payment por
// cada una —cada factura es un documento fiscal y tiene que saber cómo se saldó—. Pero contra
// la caja eso fue UN movimiento: el cliente entregó un billete, no tres. Sin esta columna, el
// movimiento del diario mostraba tres líneas de Ref.1,67 + Ref.1,33 + … que nadie puede
// cuadrar contra lo que hay físicamente en la gaveta.
//
// Con el batch_id, la vista de caja agrupa esas filas en una sola línea por su total, y el
// detalle por factura sigue intacto en la tabla y en el módulo de Pagos.
//
// Nullable a propósito: un cobro normal (una factura, un pago) no pertenece a ningún lote y
// se sigue mostrando tal cual.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payments', 'batch_id', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addIndex('payments', ['batch_id'], { name: 'payments_batch_id_idx' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('payments', 'payments_batch_id_idx');
    await queryInterface.removeColumn('payments', 'batch_id');
  },
};
