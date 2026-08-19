const { AsyncLocalStorage } = require('async_hooks');

const tenantStorage = new AsyncLocalStorage();

/**
 * Ejecuta `fn` con el filtro multi-empresa desactivado.
 *
 * Es la ÚNICA forma de saltarse el aislamiento entre empresas, y existe para las
 * operaciones de plataforma que por definición cruzan empresas: hoy, borrar una empresa
 * completa desde el panel de superusuario.
 *
 * No se desactiva por rol. Un superusuario que navega el ERP normal debe seguir viendo
 * solo su empresa: si el filtro se apaga por ser superusuario, los listados y reportes
 * mezclan datos de todos los clientes y —peor— los hooks de creación dejan de estampar
 * company_id, así que todo lo que cree queda huérfano (company_id NULL), invisible para
 * su empresa y fuera de las cascadas de borrado.
 *
 * Úsese siempre acotado a la operación, nunca alrededor de un request entero, y solo
 * después de haber comprobado `req.is_superuser` en el controlador.
 */
function runWithoutTenant(fn) {
  const store = tenantStorage.getStore() || {};
  return tenantStorage.run({ ...store, bypass_tenant: true }, fn);
}

module.exports = { tenantStorage, runWithoutTenant };
