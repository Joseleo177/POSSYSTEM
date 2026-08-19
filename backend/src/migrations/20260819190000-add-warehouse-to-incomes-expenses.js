'use strict';

// Los ingresos y egresos manuales no tenían almacén: un gasto registrado en una sucursal era
// indistinguible de uno de otra, y sin esta columna Contabilidad no puede filtrar por
// sucursal como sí hace con ventas y compras.
//
// Los registros anteriores se asignan al almacén principal de su empresa: no hay forma de
// saber en cuál se hicieron, y dejarlos en NULL los volvería invisibles para todos salvo el
// admin. La columna queda opcional en la base —los históricos son lo que son— pero el alta
// nueva la exige desde el servicio.
const TABLES = ['incomes', 'expenses'];

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of TABLES) {
      await queryInterface.addColumn(table, 'warehouse_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'warehouses', key: 'id' },
        onDelete: 'RESTRICT',
      });

      await queryInterface.sequelize.query(`
        UPDATE ${table} t
           SET warehouse_id = (
             SELECT w.id FROM warehouses w
              WHERE w.company_id IS NOT DISTINCT FROM t.company_id
              ORDER BY w.active DESC, w.sort_order ASC, w.id ASC
              LIMIT 1
           )
         WHERE t.warehouse_id IS NULL;
      `);

      await queryInterface.addIndex(table, ['warehouse_id'], { name: `${table}_warehouse_id_idx` });
    }
  },

  async down(queryInterface) {
    for (const table of TABLES) {
      await queryInterface.removeIndex(table, `${table}_warehouse_id_idx`);
      await queryInterface.removeColumn(table, 'warehouse_id');
    }
  },
};
