'use strict';

// Clave de idempotencia: evita que un reintento de red genere ventas
// duplicadas. El cliente envía un UUID por intento de cobro; si la venta
// ya existe con esa clave, el backend devuelve la venta original.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('sales', 'idempotency_key', {
      type: Sequelize.STRING(64),
      allowNull: true,
      unique: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('sales', 'idempotency_key');
  },
};
