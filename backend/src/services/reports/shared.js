const { Sequelize } = require("../../models");
const { Op } = Sequelize;

function sanitizeDate(val) {
  if (!val) return null;
  const match = String(val).match(/^(\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : null;
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
function localDate(col) {
  return `(${col} AT TIME ZONE '${TZ}')::date`;
}

function dateClause(date_from, date_to, alias = '') {
  const col = localDate(alias ? `${alias}.created_at` : 'created_at');
  const parts = [];
  if (date_from) parts.push(`AND ${col} >= '${date_from}'::date`);
  if (date_to)   parts.push(`AND ${col} <= '${date_to}'::date`);
  return parts.join(' ');
}

// Estados de una factura consumada, listos para intercalar en el SQL crudo de los reportes:
// `status IN (${SETTLED_SQL})`. Se reexporta desde acá para que los reportes lo tomen de su
// propio shared —igual que dateClause— y no de una ruta a utils distinta en cada archivo.
const { SETTLED_SQL } = require("../../utils/saleBalance");

module.exports = { sanitizeDate, buildTenantContext, buildWarehouseScope, dateClause, localDate, TZ, SETTLED_SQL };
