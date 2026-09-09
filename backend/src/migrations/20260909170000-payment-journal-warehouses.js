'use strict';

// Un diario puede atender a VARIAS sucursales (no solo a una o a todas). La relación vive en
// su propia tabla; `payment_journals.warehouse_id` se conserva como cache denormalizada (la
// primera sucursal asignada, o NULL) para las pantallas que aún la leen.
//
// Semántica: un diario SIN filas acá alcanza a todas las sucursales (compartido, como el
// NULL de antes). Con filas, solo a esas.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('payment_journal_warehouses', {
      journal_id:   { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
      warehouse_id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
      company_id:   { type: Sequelize.INTEGER, allowNull: true },
    });
    await queryInterface.addIndex('payment_journal_warehouses', ['warehouse_id'], {
      name: 'pjw_warehouse_id_idx',
    });

    // Migrar lo existente: cada diario con warehouse_id -> una fila. Los NULL quedan sin
    // filas = todas las sucursales.
    await queryInterface.sequelize.query(`
      INSERT INTO payment_journal_warehouses (journal_id, warehouse_id, company_id)
      SELECT id, warehouse_id, company_id
      FROM payment_journals
      WHERE warehouse_id IS NOT NULL
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('payment_journal_warehouses');
  },
};
