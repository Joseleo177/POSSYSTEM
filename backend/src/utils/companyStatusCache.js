/**
 * Caché del estado de suscripción por empresa.
 *
 * El middleware de auth comprueba en CADA request que la empresa siga activa, vigente y no
 * suspendida. Eso es una consulta a `companies` por cada llamada de cada caja: en hora pico
 * son cientos por minuto para leer una fila que cambia una vez al mes.
 *
 * El TTL es corto a propósito (30 s) y las escrituras del panel de superusuario invalidan la
 * entrada al instante, así que suspender una empresa surte efecto de inmediato y no queda
 * una ventana en la que siga trabajando gratis.
 */
const TTL_MS = 30 * 1000;

const cache = new Map(); // company_id -> { value, expires }

function getCompanyStatus(companyId) {
  const hit = cache.get(companyId);
  if (!hit || hit.expires < Date.now()) {
    cache.delete(companyId);
    return null;
  }
  return hit.value;
}

function setCompanyStatus(companyId, value) {
  cache.set(companyId, { value, expires: Date.now() + TTL_MS });
}

function invalidateCompanyStatus(companyId) {
  cache.delete(companyId);
}

module.exports = { getCompanyStatus, setCompanyStatus, invalidateCompanyStatus };
