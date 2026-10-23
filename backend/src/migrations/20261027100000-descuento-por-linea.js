'use strict';

/**
 * Descuento por línea en el POS.
 *
 * 1. `sale_items` guarda el descuento manual tal como se dio: el modo ('pct' o 'amount'), el
 *    valor (porcentaje, o monto de la LÍNEA en moneda base con 5 decimales, igual que
 *    `sales.discount_amount`) y quién lo dio. `discount` sigue siendo el descuento por unidad
 *    que usan el subtotal generado, el ticket y las devoluciones; estas columnas solo dicen de
 *    dónde salió —sin ellas un descuento manual no se distingue de una promoción— y permiten
 *    devolverlo al carrito al retomar una cuenta en espera.
 *
 * 2. Permiso nuevo `sales.discount`. Hasta hoy cualquiera que facturaba podía dar el descuento
 *    global; ahora lo exige el servidor. Para no quitárselo a nadie se le concede a cada rol que
 *    ya tenía `sales.create`. Recortarlo es una decisión que se toma desde la pantalla de Roles.
 *    El administrador es `{all: true}` y los roles con claves viejas lo reciben por LEGACY_MAP.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sale_items', 'line_discount_mode', { type: Sequelize.STRING(10), allowNull: true });
    await queryInterface.addColumn('sale_items', 'line_discount_value', { type: Sequelize.DECIMAL(14, 5), allowNull: true });
    await queryInterface.addColumn('sale_items', 'discount_by', { type: Sequelize.INTEGER, allowNull: true });

    await queryInterface.sequelize.query(`
      UPDATE roles
         SET permissions = permissions || '{"sales.discount": true}'::jsonb
       WHERE (permissions->>'sales.create')::boolean IS TRUE
         AND permissions->'sales.discount' IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE roles SET permissions = permissions - 'sales.discount'
       WHERE permissions->'sales.discount' IS NOT NULL
    `);
    await queryInterface.removeColumn('sale_items', 'discount_by');
    await queryInterface.removeColumn('sale_items', 'line_discount_value');
    await queryInterface.removeColumn('sale_items', 'line_discount_mode');
  },
};
