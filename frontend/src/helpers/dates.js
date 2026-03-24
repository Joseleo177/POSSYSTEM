/**
 * Formatea una fecha ISO a string localizado venezolano.
 * @param {string} isoDate
 */
export const fmtDate = (isoDate) =>
  new Date(isoDate).toLocaleString("es-VE");

/**
 * Formatea una fecha ISO a solo fecha (sin hora), locale Venezuela.
 * @param {string} isoDate
 * @param {object} [options] - Opciones de toLocaleDateString
 */
export const fmtDateShort = (isoDate, options) =>
  new Date(isoDate).toLocaleDateString("es-VE", options);

/**
 * Devuelve la fecha de hoy en formato YYYY-MM-DD (valor de input[type=date]).
 */
export const todayISO = () => new Date().toISOString().slice(0, 10);
