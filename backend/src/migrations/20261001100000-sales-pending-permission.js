'use strict';

/**
 * Permiso nuevo `sales.pending`: ver el botón "Pendientes" (y el F5) del POS.
 *
 * Hasta hoy lo veía cualquiera que entrara al POS, y el POS se abre con `sales.view`. Un
 * permiso nuevo no lo tiene nadie, así que sin esto el botón desaparecería de golpe para
 * todos menos el administrador. Se le concede a cada rol que ya tenía `sales.view`; recortarlo
 * es una decisión que se toma desde la pantalla de Roles.
 *
 * El administrador es `{all: true}` y no necesita nada. Los roles que aún guardan claves
 * viejas de módulo lo reciben por el LEGACY_MAP.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE roles
         SET permissions = permissions || '{"sales.pending": true}'::jsonb
       WHERE (permissions->>'sales.view')::boolean IS TRUE
         AND permissions->'sales.pending' IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE roles SET permissions = permissions - 'sales.pending'
       WHERE permissions->'sales.pending' IS NOT NULL
    `);
  },
};
