'use strict';

// Una serie pertenece a un almacén: los almacenes son las sucursales de la empresa y cada
// sucursal numera sus facturas por su cuenta. Sin esto, la numeración era de la empresa
// entera y dos cajas de sucursales distintas consumían el mismo correlativo.
//
// La columna es obligatoria. Las series que ya existen se asignan al almacén principal de
// su empresa (el de menor sort_order, y a igualdad el más antiguo), que es el que venían
// usando de hecho.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('series', 'warehouse_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'RESTRICT',
    });

    await queryInterface.sequelize.query(`
      UPDATE series s
         SET warehouse_id = (
           SELECT w.id FROM warehouses w
            WHERE w.company_id IS NOT DISTINCT FROM s.company_id
            ORDER BY w.active DESC, w.sort_order ASC, w.id ASC
            LIMIT 1
         )
       WHERE s.warehouse_id IS NULL;
    `);

    // Si alguna serie quedó sin almacén es porque su empresa no tiene ninguno: mejor parar
    // acá que dejar la base a medias con un NOT NULL que va a fallar sin explicar por qué.
    const [huerfanas] = await queryInterface.sequelize.query(`
      SELECT id, name, company_id FROM series WHERE warehouse_id IS NULL;
    `);
    if (huerfanas.length) {
      const detalle = huerfanas.map(s => `#${s.id} "${s.name}" (empresa ${s.company_id})`).join(', ');
      throw new Error(
        `No se pudo asignar almacén a estas series porque su empresa no tiene almacenes: ${detalle}. ` +
        `Crea un almacén en esas empresas y vuelve a ejecutar la migración.`
      );
    }

    // SET NOT NULL directo en vez de changeColumn: changeColumn vuelve a emitir la
    // referencia y Postgres termina con dos claves foráneas idénticas sobre la columna.
    await queryInterface.sequelize.query(
      `ALTER TABLE series ALTER COLUMN warehouse_id SET NOT NULL;`
    );

    await queryInterface.addIndex('series', ['warehouse_id'], { name: 'series_warehouse_id_idx' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('series', 'series_warehouse_id_idx');
    await queryInterface.removeColumn('series', 'warehouse_id');
  },
};
