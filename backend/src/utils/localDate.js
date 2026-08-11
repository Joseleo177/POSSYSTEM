/**
 * Normaliza una fecha elegida en un calendario ('YYYY-MM-DD') a medianoche LOCAL.
 *
 * Las columnas date de incomes/expenses son TIMESTAMPTZ, o sea instantes. Un string
 * 'YYYY-MM-DD' suelto lo interpreta JS como medianoche UTC, y en UTC-4 eso aterriza a las
 * 8 de la noche del día ANTERIOR: se elegía el 10 y el movimiento quedaba grabado el 9.
 *
 * Anexar la hora sin sufijo de zona ancla la fecha a medianoche en la zona del proceso
 * (TZ del contenedor), que es el día que el usuario realmente escogió. Los valores que ya
 * traen hora se dejan pasar tal cual: son instantes y no hay nada que interpretar.
 */
function toLocalDate(value) {
  if (!value) return null;
  const onlyDay = /^(\d{4}-\d{2}-\d{2})$/.exec(String(value).trim());
  return onlyDay ? new Date(`${onlyDay[1]}T00:00:00`) : new Date(value);
}

module.exports = { toLocalDate };
