'use strict';

// Un diario (caja o banco) pasa a pertenecer a una sucursal: la caja de efectivo de una
// tienda no es la de la otra, y el Estado de Cuenta de cada encargado debe mostrar la suya.
//
// La columna es OPCIONAL a propósito. Un diario sin almacén es compartido —el caso de una
// cuenta bancaria de la empresa donde entran cobros de todas las sucursales— y sigue
// disponible en cualquier caja. Hacerla obligatoria habría forzado a duplicar esas cuentas.
//
// Los diarios que ya existen se asignan al almacén principal de su empresa, según lo
// decidido: si alguno era en realidad de otra sucursal, se reasigna desde la pantalla.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payment_journals', 'warehouse_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'RESTRICT',
    });

    await queryInterface.sequelize.query(`
      UPDATE payment_journals j
         SET warehouse_id = (
           SELECT w.id FROM warehouses w
            WHERE w.company_id IS NOT DISTINCT FROM j.company_id
            ORDER BY w.active DESC, w.sort_order ASC, w.id ASC
            LIMIT 1
         )
       WHERE j.warehouse_id IS NULL;
    `);

    await queryInterface.addIndex('payment_journals', ['warehouse_id'], {
      name: 'payment_journals_warehouse_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('payment_journals', 'payment_journals_warehouse_id_idx');
    await queryInterface.removeColumn('payment_journals', 'warehouse_id');
  },
};