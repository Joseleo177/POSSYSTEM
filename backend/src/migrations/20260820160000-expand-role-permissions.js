'use strict';

// Los permisos pasan de un booleano por módulo ({ sales: true }) a acciones concretas
// ({ "sales.create": true, "sales.void": true, ... }).
//
// Cada rol se expande según LEGACY_MAP: quien podía vender sigue pudiendo vender, cobrar,
// anular y dar crédito. NADIE PIERDE ACCESO en la migración —el sistema está en producción y
// un lunes con la caja trabada no es una opción—. Recortar es una decisión que se toma
// después, con calma, desde la pantalla de Roles.
//
// El rol admin no se toca: `{ all: true }` sigue significando lo mismo.
const { expandLegacy } = require('../config/permissions');

module.exports = {
  async up(queryInterface) {
    const [roles] = await queryInterface.sequelize.query(
      `SELECT id, name, permissions FROM roles;`
    );

    for (const role of roles) {
      const actuales = role.permissions || {};
      if (actuales.all) continue;                       // administrador: intacto

      const expandidos = expandLegacy(actuales);
      // Se conserva también el permiso viejo. Es la red por si algo quedó pidiendo la clave
      // antigua: `permit` entiende los dos formatos, así que tener ambos no suma acceso, y
      // permite volver atrás sin quedarse sin datos.
      const merged = { ...actuales, ...expandidos };

      await queryInterface.sequelize.query(
        `UPDATE roles SET permissions = :perms WHERE id = :id;`,
        { replacements: { perms: JSON.stringify(merged), id: role.id } }
      );
    }
  },

  async down(queryInterface) {
    // Se quitan solo las claves granulares; los permisos viejos quedaron guardados en el up,
    // así que cada rol vuelve exactamente a lo que era.
    const [roles] = await queryInterface.sequelize.query(
      `SELECT id, permissions FROM roles;`
    );

    for (const role of roles) {
      const actuales = role.permissions || {};
      if (actuales.all) continue;

      const soloViejos = Object.fromEntries(
        Object.entries(actuales).filter(([k, v]) => v && !k.includes('.'))
      );
      await queryInterface.sequelize.query(
        `UPDATE roles SET permissions = :perms WHERE id = :id;`,
        { replacements: { perms: JSON.stringify(soloViejos), id: role.id } }
      );
    }
  },
};