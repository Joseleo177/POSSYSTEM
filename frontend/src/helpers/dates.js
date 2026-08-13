/**
 * Formatea una fecha ISO a fecha + hora: "21/07/2026, 20:48".
 *
 * toLocaleString("es-VE") a secas devolvía "21/7/2026, 8:48:44 p. m.": sin ceros a la
 * izquierda, con segundos que nunca hacen falta y un "p. m." que además queda partido
 * cuando el contenedor aplica uppercase. Se usa h23 en vez de hour12:false porque este
 * último puede rendir la medianoche como 24:05 según el motor.
 * @param {string} isoDate
 */
export const fmtDate = (isoDate) => {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-VE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
};

/**
 * Formatea una fecha ISO a solo fecha (sin hora): "21/07/2026".
 *
 * El default lleva 2 dígitos para que cuadre con [fmtDate] y con el resto de las
 * tablas; sin él salía "21/7/2026" y las columnas de fecha no alineaban.
 * @param {string} isoDate
 * @param {object} [options] - Opciones de toLocaleDateString
 */
export const fmtDateShort = (isoDate, options) => {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-VE", options ?? {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
};

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
