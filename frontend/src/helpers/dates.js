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
 * Convierte un Date a YYYY-MM-DD usando el calendario LOCAL.
 *
 * toISOString() convierte a UTC antes de recortar, así que en UTC-4 devuelve el día
 * siguiente a partir de las 8 de la noche: el filtro "hoy" apuntaba a mañana y las
 * pantallas no cuadraban con los reportes. Aquí se leen los componentes locales.
 * @param {Date} [date]
 */
export const toLocalISO = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/**
 * Devuelve la fecha de hoy en formato YYYY-MM-DD (valor de input[type=date]).
 */
export const todayISO = () => toLocalISO();
