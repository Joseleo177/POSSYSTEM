const { Sequelize } = require("../../models");
const { Op } = Sequelize;

function sanitizeDate(val) {
  if (!val) return null;
  const match = String(val).match(/^(\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : null;
}

// Hora del filtro de franja: "18", "18:30" → "18:00", "18:30". Se normaliza a HH:MM porque
// se interpola en el SQL como literal TIME, igual que las fechas.
function sanitizeHour(val) {
  if (val === undefined || val === null || val === "") return null;
  const m = String(val).match(/^(\d{1,2})(?::([0-5]\d))?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
}

// Franja horaria opcional del reporte. Devuelve null —que es "el día completo", el
// comportamiento de siempre— salvo que lleguen las dos horas y sean distintas: una franja de
// 00:00 a 00:00 no se sabe si son 24 horas o ninguna, así que se trata como sin filtro.
//
// `overnight` es el caso que motivó todo esto: 18:00 → 04:00 no es un rango vacío, es una
// jornada nocturna que cruza la medianoche.
function buildHours(query = {}) {
  const from = sanitizeHour(query.hour_from);
  const to   = sanitizeHour(query.hour_to);
  if (!from || !to || from === to) return null;
  return { from, to, overnight: to < from };
}

const { visibleWarehouseIds } = require("../../middleware/auth");

// Recorta un reporte a las sucursales del empleado. Devuelve una función que arma el
// fragmento SQL para el alias que corresponda: los reportes son SQL crudo y el mismo alias
// ("p") significa purchases en un reporte y products en otro, así que el alias lo decide
// cada consulta, no este helper.
//
// Los ids salen de la base y se validan como enteros antes de interpolarse.
function buildWarehouseScope(allowedWarehouses) {
  if (allowedWarehouses === null) return () => '';        // admin: sin recorte

  const ids = (allowedWarehouses || []).filter(Number.isInteger);
  if (!ids.length) return () => 'AND FALSE';              // sin almacenes asignados: no ve nada

  const list = ids.join(',');
  return (alias = '') => {
    const prefix = alias ? `${alias}.` : '';
    return `AND ${prefix}warehouse_id IN (${list})`;
  };
}

// Ids que llegan por query: pueden venir como lista repetida (?ids=1&ids=2) o separados por
// coma. Se validan como enteros antes de interpolarse, que es como se arma el resto del SQL
// crudo de los reportes.
function idList(value) {
  if (value === undefined || value === null || value === "") return null;
  const crudos = Array.isArray(value) ? value : String(value).split(",");
  const ids = crudos.map(n => parseInt(n, 10)).filter(Number.isInteger);
  return ids.length ? ids : null;
}

// Recorte por serie de facturación, con la misma forma que buildWarehouseScope: devuelve una
// función que arma el fragmento para el alias que corresponda, porque el mismo alias significa
// cosas distintas en cada consulta. Sin series pedidas no recorta nada.
//
// La serie vive en la venta. Un cobro se filtra por la de la suya —ver los usos con
// subconsulta— y lo cargado a mano queda fuera: un ingreso manual no pertenece a ninguna.
function buildSerieScope(serie_ids) {
  const ids = idList(serie_ids);
  if (!ids) return () => '';
  const list = ids.join(',');
  return (alias = '') => `AND ${alias ? `${alias}.` : ''}serie_id IN (${list})`;
}

async function buildTenantContext(req) {
  const company_id  = req.employee?.company_id ?? null;
  const scoped      = !!company_id;
  const allowedWarehouses = await visibleWarehouseIds(req);
  return {
    company_id,
    isSuperuser: !scoped,
    rep:  { cid: company_id },
    tc:   scoped ? `AND company_id = :cid`    : '',
    tcS:  scoped ? `AND s.company_id = :cid`  : '',
    tcS2: scoped ? `AND s2.company_id = :cid` : '',
    tcP:  scoped ? `AND p.company_id = :cid`  : '',
    tcC:  scoped ? `AND c.company_id = :cid`  : '',
    allowedWarehouses,
    wh:   buildWarehouseScope(allowedWarehouses),
    // Franja horaria del filtro. Viaja con el contexto porque entra por el mismo query que
    // las fechas y la necesita cada consulta que corte por período.
    hours: buildHours(req.query),
  };
}

// Zona horaria de operación. Los created_at son TIMESTAMPTZ (instantes en UTC);
// el día al que pertenece cada registro depende de la zona en que se lo mire.
// Comparar contra un literal 'YYYY-MM-DD' sin convertir corta los días en UTC,
// y en UTC-4 eso empuja todo lo registrado desde las 8 PM al día siguiente.
const TZ = process.env.DB_TIMEZONE || 'America/Caracas';

// Fecha local de un TIMESTAMPTZ. Usar en filtros y en GROUP BY por día para que
// ambos definan "día" igual; de lo contrario el total del rango no cuadra con
// la suma de sus días.
//
// Con una franja nocturna (18:00 → 04:00) el "día" deja de ser la fecha del calendario y
// pasa a ser la jornada: la madrugada del domingo pertenece a la noche del sábado, que es
// como la cuenta quien cierra la caja. Se logra corriendo el reloj hacia atrás hasta la hora
// de apertura, con lo que los dos lados de la medianoche caen en la misma fecha. Sin franja
// —o con una que no cruza medianoche— la expresión es la de siempre.
function localDate(col, hours = null) {
  const local = `(${col} AT TIME ZONE '${TZ}')`;
  if (hours?.overnight) return `((${local} - INTERVAL '${hours.from}')::date)`;
  return `${local}::date`;
}

// Recorte a la franja horaria, aparte del recorte por día. El extremo superior es exclusivo
// para que dos franjas contiguas (08:00–14:00 y 14:00–20:00) no cuenten dos veces la venta
// que cayó justo en el borde.
function hourClause(col, hours = null) {
  if (!hours) return '';
  const t = `(${col} AT TIME ZONE '${TZ}')::time`;
  return hours.overnight
    ? `AND (${t} >= TIME '${hours.from}' OR ${t} < TIME '${hours.to}')`
    : `AND ${t} >= TIME '${hours.from}' AND ${t} < TIME '${hours.to}'`;
}

function dateClause(date_from, date_to, alias = '', hours = null) {
  const raw = alias ? `${alias}.created_at` : 'created_at';
  const col = localDate(raw, hours);
  const parts = [];
  if (date_from) parts.push(`AND ${col} >= '${date_from}'::date`);
  if (date_to)   parts.push(`AND ${col} <= '${date_to}'::date`);
  const h = hourClause(raw, hours);
  if (h) parts.push(h);
  return parts.join(' ');
}

// Estados de una factura consumada, listos para intercalar en el SQL crudo de los reportes:
// `status IN (${SETTLED_SQL})`. Se reexporta desde acá para que los reportes lo tomen de su
// propio shared —igual que dateClause— y no de una ruta a utils distinta en cada archivo.
const { SETTLED_SQL, DISPATCHED_SQL, UNPAID_SQL } = require("../../utils/saleBalance");

module.exports = { sanitizeDate, sanitizeHour, buildHours, buildTenantContext, buildWarehouseScope, buildSerieScope, idList, dateClause, hourClause, localDate, TZ, SETTLED_SQL, DISPATCHED_SQL, UNPAID_SQL };
