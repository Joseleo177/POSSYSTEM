const { sequelize, Sequelize } = require("../models");

// Huella de lo que una pantalla consulta cada pocos segundos (cocina, mapa de mesas, QR de la
// mesa). La pantalla manda la huella de lo que ya tiene (?v=...); si no cambió nada, se responde
// "sin cambios" con UNA consulta liviana, en vez de armar la respuesta entera (joins, listas de
// platos) cada 5 o 15 segundos. Además la huella vive unos segundos en memoria del proceso: las
// tablets de la cocina, o los teléfonos de una misma mesa, comparten la misma consulta.
//
// En Vercel cada instancia tiene su propia memoria y se apaga sola: el caché es de buena fe,
// y el TTL corto acota cuánto puede atrasarse una pantalla (nunca más de `ttlMs`).

const cache = new Map();   // clave → { v, at }
const MAX = 2000;

/**
 * Huella de `clave`: el md5 que devuelve `sql` (debe seleccionar una sola columna `v`), o la
 * guardada hace menos de `ttlMs`. Con `ttlMs` 0 siempre consulta.
 */
async function huella(clave, sql, replacements, ttlMs = 2000) {
  const ahora = Date.now();
  const h = cache.get(clave);
  if (h && ahora - h.at < ttlMs) return h.v;
  const [fila] = await sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });
  const v = fila?.v || "vacio";
  if (cache.size >= MAX) cache.delete(cache.keys().next().value);
  cache.set(clave, { v, at: ahora });
  return v;
}

/** Olvida las huellas que empiezan con `prefijo`: quien acaba de escribir no espera el TTL. */
function olvidar(prefijo) {
  for (const k of cache.keys()) if (k.startsWith(prefijo)) cache.delete(k);
}

module.exports = { huella, olvidar };
