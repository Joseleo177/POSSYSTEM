const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, localDate, hourClause, idList } = require("./shared");

// Cobros por día y por diario de pago.
//
// El Estado de Cuenta de Contabilidad agrupa los diarios por banco, así que con dos diarios
// del mismo banco (un punto de venta y un pago móvil, por ejemplo) sus montos quedan sumados
// sin forma de separarlos. Aquí cada diario es su propia columna.
//
// La matriz por día son SOLO cobros de ventas, y eso no es una omisión: su total tiene que
// cuadrar contra el reporte de ventas, y una celda debe poder conciliarse contra el punto o
// el banco. Mezclarle ingresos y egresos manuales la volvería un número que no cuadra ni con
// ventas ni con caja.
//
// Pero el dinero cargado a mano también está en esa caja, así que va aparte: `manual` trae
// ingresos y egresos por diario para pintarlos como filas de resumen bajo el total, y de ahí
// sale el movimiento neto. Cada cifra conserva su significado y el cierre del día se lee en
// una sola pantalla, sin entrar diario por diario al Estado de Cuenta.
//
// Sobre los montos: payments.amount está en moneda base y exchange_rate es la tasa aplicada,
// de modo que amount * exchange_rate devuelve el monto en la moneda del diario. Se publican
// los dos: el original es el que el cajero contó, el base es el único que se puede sumar
// entre diarios de distinta moneda. incomes y expenses guardan lo mismo en `amount` y `rate`.
async function paymentJournalsReport({ date_from, date_to, company_id, allowedWarehouses, employee_ids, serie_ids, hours, warehouse_id }) {
  const from = sanitizeDate(date_from);
  const to   = sanitizeDate(date_to);

  // Sucursal concreta. Casi nunca es la misma cuenta bancaria en cada tienda —"Banco de
  // Venezuela" puede ser dos cuentas reales distintas, una por sucursal— así que el Estado
  // de Cuenta necesita poder aislar una sola sin tener que sumarlas todas de cabeza. Sin
  // sucursal elegida rige el recorte de siempre: lo que el usuario tiene permitido ver.
  const wid = warehouse_id ? parseInt(warehouse_id) : null;
  if (wid && Array.isArray(allowedWarehouses) && !allowedWarehouses.includes(wid)) {
    const e = new Error("No tienes acceso a este almacén"); e.status = 403; e.isOperational = true; throw e;
  }
  // Día al que se imputa cada movimiento. Sin franja horaria es la fecha de Caracas de
  // siempre; con una franja nocturna es la jornada, para que la madrugada del domingo caiga
  // en la fila del sábado en vez de abrir una fila propia con la cola de la noche.
  const diaPago = localDate('p.created_at', hours);

  const rep = { cid: company_id };
  const scoped = !!company_id;

  // ── Filtros opcionales ────────────────────────────────────────────────────────
  // Por usuario: manda quién registró el cobro, no quién hizo la venta —el reporte mide el
  // dinero que pasó por cada caja—. Los cobros antiguos sin empleado caen al de su venta,
  // para que no desaparezcan del filtro.
  const empleados = idList(employee_ids);
  const empClause = empleados
    ? `AND COALESCE(p.employee_id, (SELECT s.employee_id FROM sales s WHERE s.id = p.sale_id)) IN (${empleados.join(',')})`
    : '';

  // Por serie: vive en la venta, así que el cobro se filtra por la suya. Un cobro sin venta
  // asociada no tiene serie y queda fuera, que es lo correcto: la serie es del documento.
  const series = idList(serie_ids);
  const serieClause = series
    ? `AND p.sale_id IN (SELECT id FROM sales WHERE serie_id IN (${series.join(',')}))`
    : '';

  // Un cobro no guarda sucursal: la hereda de su venta. Se resuelve con una subconsulta para
  // no volver a meter el JOIN a sales que se quitó de la consulta principal.
  let whClause = '';
  if (wid) {
    whClause = `AND p.sale_id IN (SELECT id FROM sales WHERE warehouse_id = ${wid})`;
  } else if (Array.isArray(allowedWarehouses)) {
    const ids = allowedWarehouses.filter(Number.isInteger);
    whClause = ids.length
      ? `AND p.sale_id IN (SELECT id FROM sales WHERE warehouse_id IN (${ids.join(',')}))`
      : 'AND FALSE';
  }

  // Las fechas se agrupan en hora de Caracas: en UTC, un cobro de las 8 de la noche cae al
  // día siguiente y el cuadre diario no coincidiría con el turno de caja. TZ sale de shared.js
  // para que todos los reportes definan "día" igual.
  const parts = [];
  if (from) parts.push(`AND ${diaPago} >= :dfrom`);
  if (to)   parts.push(`AND ${diaPago} <= :dto`);
  if (from) rep.dfrom = from;
  if (to)   rep.dto   = to;
  // El recorte a la franja va aparte del recorte por día: uno dice qué jornadas entran, el
  // otro qué horas de cada jornada.
  const franja = hourClause('p.created_at', hours);
  if (franja) parts.push(franja);
  const dateClause = parts.join(" ");

  // Ingresos y egresos sí llevan su propia sucursal, así que no hace falta la subconsulta a
  // sales que necesitan los cobros.
  const manualWhClause = (alias) => {
    if (wid) return `AND ${alias}.warehouse_id = ${wid}`;
    if (!Array.isArray(allowedWarehouses)) return '';
    const ids = allowedWarehouses.filter(Number.isInteger);
    return ids.length ? `AND ${alias}.warehouse_id IN (${ids.join(',')})` : 'AND FALSE';
  };

  // Los manuales quedan fuera de la franja horaria a propósito: `date` es un día que la
  // persona eligió a mano, sin hora, así que recortarlo por horas lo borraría del cuadre.
  // Siguen imputándose a su fecha de calendario aunque los cobros se agrupen por jornada.
  const manualDateClause = (alias) => {
    const col = localDate(`COALESCE(${alias}.date, ${alias}.created_at)`);
    const p = [];
    if (from) p.push(`AND ${col} >= :dfrom`);
    if (to)   p.push(`AND ${col} <= :dto`);
    return p.join(" ");
  };

  const rows = await sequelize.query(
    `SELECT ${diaPago}                                            AS day,
            p.payment_journal_id                                  AS journal_id,
            COUNT(p.id)::int                                      AS tx_count,
            COALESCE(SUM(p.amount * COALESCE(p.exchange_rate, 1)), 0)::float AS amount_journal,
            COALESCE(SUM(p.amount), 0)::float                      AS amount_base
       FROM payments p
      -- Aquí no va filtro por estado de la venta, a diferencia del resto de los reportes:
      -- esto mide plata que entró a cada diario, no ventas. Al anular se registra un pago
      -- inverso, así que el neto ya queda bien. (El JOIN a sales que había no se usaba.)
      WHERE p.payment_journal_id IS NOT NULL
        ${scoped ? "AND p.company_id = :cid" : ""}
        ${whClause}
        ${dateClause}
        ${empClause}
        ${serieClause}
      GROUP BY day, p.payment_journal_id
      ORDER BY day DESC`,
    { replacements: rep, type: Sequelize.QueryTypes.SELECT }
  );

  // ── Ingresos y egresos cargados a mano ────────────────────────────────────────
  // Se agrupan por COALESCE(date, created_at) y no por created_at a secas: `date` es el día
  // que la persona eligió al registrar el movimiento, y ese es el día en que el dinero entró
  // o salió de la caja. Agrupar por la fecha de captura mandaría al día equivocado todo lo
  // que se carga con fecha atrasada.
  const manualQuery = (table, alias) => `
    SELECT ${localDate(`COALESCE(${alias}.date, ${alias}.created_at)`)} AS day,
           ${alias}.payment_journal_id                                   AS journal_id,
           COUNT(${alias}.id)::int                                       AS tx_count,
           COALESCE(SUM(${alias}.amount * COALESCE(${alias}.rate, 1)), 0)::float AS amount_journal,
           COALESCE(SUM(${alias}.amount), 0)::float                      AS amount_base
      FROM ${table} ${alias}
     WHERE ${alias}.payment_journal_id IS NOT NULL
       -- Un movimiento anulado no mueve plata: queda en el histórico, no en el cuadre.
       AND ${alias}.status = 'activo'
       ${scoped ? `AND ${alias}.company_id = :cid` : ""}
       ${manualWhClause(alias)}
       ${manualDateClause(alias)}
       ${empleados ? `AND ${alias}.employee_id IN (${empleados.join(',')})` : ""}
       -- Filtrando por serie, lo cargado a mano queda fuera: un ingreso o un egreso manual no
       -- pertenece a ninguna serie de facturación, y colarlo inflaría el neto de ese corte.
       ${series ? "AND FALSE" : ""}
     GROUP BY day, ${alias}.payment_journal_id`;

  const [incomeRows, expenseRows] = await Promise.all([
    sequelize.query(manualQuery('incomes',  'i'), { replacements: rep, type: Sequelize.QueryTypes.SELECT }),
    sequelize.query(manualQuery('expenses', 'e'), { replacements: rep, type: Sequelize.QueryTypes.SELECT }),
  ]);

  // Solo los diarios que tuvieron movimiento en el rango: una columna vacía en todas las
  // filas no aporta nada y ensancha la tabla. Un diario que solo recibió un ingreso manual
  // también cuenta: si no, su fila de resumen no tendría columna donde caer.
  const usedIds = [...new Set([...rows, ...incomeRows, ...expenseRows].map(r => r.journal_id))];
  const journals = usedIds.length
    ? await sequelize.query(
        `SELECT pj.id, pj.name, pj.color, pj.type,
                COALESCE(c.symbol, 'Ref.') AS currency_symbol,
                COALESCE(c.is_base, true)  AS is_base,
                b.name                     AS bank_name,
                w.name                     AS warehouse_name
           FROM payment_journals pj
           LEFT JOIN currencies c ON c.id = pj.currency_id
           LEFT JOIN banks b      ON b.id = pj.bank_id
           LEFT JOIN warehouses w ON w.id = pj.warehouse_id
          WHERE pj.id IN (:ids)
          ORDER BY pj.sort_order ASC, pj.id ASC`,
        { replacements: { ids: usedIds }, type: Sequelize.QueryTypes.SELECT }
      )
    : [];

  // Se arma una fila por día con una celda por diario. El total del día va en moneda base
  // porque es lo único sumable cuando hay diarios en monedas distintas.
  const byDay = new Map();
  for (const r of rows) {
    const key = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, { date: key, cells: {}, total_base: 0, tx_count: 0 });
    const day = byDay.get(key);
    day.cells[r.journal_id] = {
      amount_journal: r.amount_journal,
      amount_base:    r.amount_base,
      tx_count:       r.tx_count,
    };
    day.total_base += r.amount_base;
    day.tx_count   += r.tx_count;
  }

  const totals = { cells: {}, total_base: 0, tx_count: 0 };
  for (const r of rows) {
    const cell = totals.cells[r.journal_id] || (totals.cells[r.journal_id] = { amount_journal: 0, amount_base: 0, tx_count: 0 });
    cell.amount_journal += r.amount_journal;
    cell.amount_base    += r.amount_base;
    cell.tx_count       += r.tx_count;
    totals.total_base   += r.amount_base;
    totals.tx_count     += r.tx_count;
  }

  // Filas de resumen: un total por diario de lo cargado a mano. No se abren por día —el
  // detalle está en el Estado de Cuenta— porque lo que hace falta al cerrar es cuánto
  // sumar y cuánto restar a lo cobrado para saber qué debería haber en cada caja.
  const summarize = (src) => {
    const out = { cells: {}, total_base: 0, tx_count: 0 };
    for (const r of src) {
      const cell = out.cells[r.journal_id] || (out.cells[r.journal_id] = { amount_journal: 0, amount_base: 0, tx_count: 0 });
      cell.amount_journal += r.amount_journal;
      cell.amount_base    += r.amount_base;
      cell.tx_count       += r.tx_count;
      out.total_base      += r.amount_base;
      out.tx_count        += r.tx_count;
    }
    return out;
  };

  const incomes  = summarize(incomeRows);
  const expenses = summarize(expenseRows);

  // Cobros + ingresos − egresos: lo que efectivamente movió cada diario en el rango.
  const net = { cells: {}, total_base: 0 };
  for (const id of usedIds) {
    const v = (s) => s.cells[id] || { amount_journal: 0, amount_base: 0 };
    net.cells[id] = {
      amount_journal: v(totals).amount_journal + v(incomes).amount_journal - v(expenses).amount_journal,
      amount_base:    v(totals).amount_base    + v(incomes).amount_base    - v(expenses).amount_base,
    };
  }
  net.total_base = totals.total_base + incomes.total_base - expenses.total_base;

  return {
    journals,
    days: [...byDay.values()],
    totals,
    manual: { incomes, expenses, net },
  };
}

module.exports = paymentJournalsReport;