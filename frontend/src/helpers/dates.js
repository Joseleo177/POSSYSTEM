/**
 * Parsea una fecha que puede venir como instante ISO o como día suelto.
 *
 * `new Date("2026-08-28")` se interpreta como medianoche UTC —así lo manda el estándar
 * para las cadenas de solo fecha—, y al formatear en hora de Caracas (UTC-4) eso rinde
 * el 27: el período de un reporte pedido para el 28 salía impreso como 27. Un día suelto
 * no es un instante, así que se arma con los componentes en calendario local y se queda
 * en el día que dice. Las cadenas con hora ("...T20:48:00Z") sí son instantes y pasan
 * derecho al parser nativo.
 * @param {string|Date} value
 * @returns {Date|null}
 */
const parseFecha = (value) => {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const soloDia = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = soloDia
    ? new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]))
    : new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

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
  const d = parseFecha(isoDate);
  if (!d) return "—";
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
  const d = parseFecha(isoDate);
  if (!d) return "—";
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
