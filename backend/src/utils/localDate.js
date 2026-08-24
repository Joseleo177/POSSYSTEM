/**
 * Fechas de calendario ('YYYY-MM-DD') convertidas a instantes de la ZONA DE OPERACIÓN.
 *
 * Las columnas date de incomes/expenses son TIMESTAMPTZ, o sea instantes. Un string
 * 'YYYY-MM-DD' suelto lo interpreta JS como medianoche UTC, y en UTC-4 eso aterriza a las
 * 8 de la noche del día ANTERIOR: se elegía el 10 y el movimiento quedaba grabado el 9.
 *
 * La versión anterior lo resolvía anexando la hora sin sufijo de zona ('2026-08-22T00:00:00'),
 * lo que ancla la fecha a la TZ DEL PROCESO. En Docker eso es America/Caracas y funcionaba;
 * en Vercel el runtime corre en UTC y el bug volvía en producción —el movimiento se veía un
 * día antes— aunque en local todo estuviera bien. Por eso la zona va explícita acá y no se
 * hereda del entorno: es la única forma de que el mismo código dé el mismo día en los dos
 * lados.
 *
 * Sirve tanto para la fecha del documento como para los límites de un filtro por rango.
 */

// Venezuela es UTC-4 fijo, pero el cálculo pasa por Intl igual: si mañana la empresa opera en
// otra zona, basta cambiar DB_TIMEZONE y esto sigue dando el día correcto, con o sin horario
// de verano.
const TIMEZONE = process.env.DB_TIMEZONE || 'America/Caracas';

// Minutos que la zona va por delante de UTC en ese instante (Caracas: -240).
function offsetMinutes(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(instant).map(x => [x.type, x.value]));
  // Los milisegundos van explícitos: Intl no los reporta, y sin ellos la resta arrastra la
  // fracción de segundo del instante. Con .999 eso corría el fin de día un segundo hacia
  // adelante y el filtro "hasta el 22" terminaba incluyendo el 23 a las 00:00.
  const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second, instant.getUTCMilliseconds());
  return (asIfUTC - instant.getTime()) / 60000;
}

// Instante exacto de una hora de pared en la zona de operación. Se corrige dos veces porque
// el offset depende del propio instante: en un cambio de horario, la primera pasada puede
// caer del lado equivocado del salto.
function zonedInstant(y, m, d, hh = 0, mi = 0, ss = 0, ms = 0) {
  const naive = Date.UTC(y, m - 1, d, hh, mi, ss, ms);
  let instant = new Date(naive - offsetMinutes(new Date(naive), TIMEZONE) * 60000);
  instant = new Date(naive - offsetMinutes(instant, TIMEZONE) * 60000);
  return instant;
}

const ONLY_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 'YYYY-MM-DD' → medianoche de ese día en la zona de operación.
 * Los valores que ya traen hora se dejan pasar: son instantes y no hay nada que interpretar.
 */
function toLocalDate(value) {
  if (!value) return null;
  const m = ONLY_DAY.exec(String(value).trim());
  return m ? zonedInstant(+m[1], +m[2], +m[3]) : new Date(value);
}

/**
 * 'YYYY-MM-DD' → último milisegundo de ese día en la zona de operación, para cerrar un
 * rango. Antes se hacía con `.setHours(23,59,59,999)`, que también leía la TZ del proceso y
 * en producción corría el corte cuatro horas.
 */
function endOfLocalDay(value) {
  if (!value) return null;
  const m = ONLY_DAY.exec(String(value).trim());
  if (!m) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return zonedInstant(+m[1], +m[2], +m[3], 23, 59, 59, 999);
}

module.exports = { toLocalDate, endOfLocalDay, TIMEZONE };
