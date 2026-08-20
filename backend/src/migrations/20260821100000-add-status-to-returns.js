'use strict';

// Permite anular una nota de crédito sin borrarla.
//
// Una devolución mal hecha no tenía vuelta atrás: movía inventario, acreditaba saldo al
// cliente y quemaba un correlativo, y la única salida era editar la base a mano. Igual que
// con las facturas, la NC anulada se queda en la tabla —el número no se reutiliza y la
// auditoría puede verla— pero sus efectos dejan de contar en todos los cálculos.
//
// Las devoluciones existentes quedan 'activo', que es lo que venían siendo.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('returns', 'status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'activo',
    });
    // Quién y cuándo: anular revierte stock y saldos, así que tiene que quedar firmado.
    await queryInterface.addColumn('returns', 'annulled_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('returns', 'annulled_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addIndex('returns', ['status'], { name: 'returns_status_idx' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('returns', 'returns_status_idx');
    await queryInterface.removeColumn('returns', 'annulled_by');
    await queryInterface.removeColumn('returns', 'annulled_at');
    await queryInterface.removeColumn('returns', 'status');
  },
};
