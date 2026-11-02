'use strict';

// Permisos por usuario (02-11-2026). El rol sigue siendo la plantilla; cada usuario guarda solo
// sus diferencias con él: { "sales.discount": true } le da algo que el rol no tiene y
// { "sales.void": false } le quita algo que el rol sí tiene. Así cambiar el rol, o editar el rol,
// sigue llegando a todos, y la excepción de esa persona se conserva (ver effectivePermissions en
// config/permissions.js).
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS permission_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE employees DROP COLUMN IF EXISTS permission_overrides;`);
  },
};
