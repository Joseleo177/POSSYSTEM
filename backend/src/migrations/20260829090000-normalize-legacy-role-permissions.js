'use strict';

const { expandLegacy } = require('../config/permissions');

/**
 * Desmarcar un permiso en la pantalla de Roles no surtía efecto.
 *
 * Los roles guardaban los dos formatos a la vez: las claves granulares que escribe la
 * pantalla ("products.edit") y, encima, las viejas de módulo entero ("products": true) con
 * que nacieron. Y la clave vieja gana: `hasPermission` la respeta como comodín a través del
 * LEGACY_MAP, así que un rol con "products": true seguía teniendo `products.edit` aunque el
 * dueño lo hubiera desmarcado. El botón salía, y el servidor lo dejaba pasar.
 *
 * Esa compatibilidad tenía sentido mientras hubiera roles sin migrar. Para uno que ya tiene
 * sus permisos granulares es lo contrario: un comodín que ignora lo que se marca en pantalla.
 *
 * Aquí se expande cada clave vieja a las granulares que de hecho abría —usando el mismo
 * `expandLegacy` que emplea el evaluador— y después se retira la vieja. Nadie gana ni pierde
 * un permiso efectivo: lo que estaba concedido sigue concedido, pero pasa a estar escrito y,
 * por lo tanto, a poder desmarcarse.
 *
 * Se importa `expandLegacy` en vez de copiar el mapa a propósito, al revés que en otras
 * migraciones: aquí el objetivo no es reproducir un estado histórico sino dejar los roles
 * expresados en la semántica que el sistema aplica hoy.
 */
const CLAVES_VIEJAS = [
  'sales', 'products', 'customers', 'inventory', 'inventory_view',
  'purchases', 'accounting', 'reports', 'employees', 'config',
];

module.exports = {
  async up(queryInterface) {
    const [roles] = await queryInterface.sequelize.query(
      `SELECT id, permissions FROM roles`
    );

    for (const rol of roles) {
      const permisos = rol.permissions || {};
      // El administrador es `{all: true}` y no tiene nada que expandir.
      if (permisos.all) continue;
      if (!CLAVES_VIEJAS.some((k) => permisos[k])) continue;

      // expandLegacy conserva las granulares que ya estaban y añade las que abría la vieja.
      const expandido = expandLegacy(permisos);
      for (const vieja of CLAVES_VIEJAS) delete expandido[vieja];

      await queryInterface.sequelize.query(
        `UPDATE roles SET permissions = :permisos::jsonb WHERE id = :id`,
        { replacements: { permisos: JSON.stringify(expandido), id: rol.id } }
      );
    }
  },

  async down() {
    // Sin vuelta atrás: reponer las claves viejas devolvería el comodín que hacía inútil la
    // pantalla de Roles, y no hay forma de saber cuáles granulares estaban antes por sí solas.
  },
};
