const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause, localDate, buildSerieScope, idList, TZ, DISPATCHED_SQL, UNPAID_SQL } = require("./shared");

async function salesReport({ date_from, date_to, serie_ids, company_id, isSuperuser, tc, tcS, tcS2, tcP, rep, wh, allowedWarehouses, hours }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS  = dateClause(df, dt, 's', hours);
  const dR  = dateClause(df, dt, '', hours);
  const dS2 = dateClause(df, dt, 's2', hours);
  // Los canales de pago se cortan por la fecha del COBRO, no por la de la venta: ver el
  // comentario de esa consulta más abajo.
  const dP  = dateClause(df, dt, 'p', hours);
  // Día al que pertenece cada registro. Con franja nocturna es la jornada, no la fecha del
  // calendario, y tiene que ser la MISMA expresión que usa el filtro o el total del rango no
  // cuadraría con la suma de las filas por día.
  const diaR = localDate('created_at', hours);

  // Recorte por sucursal para una consulta que sale de payments y no pasa por sales: el
  // cobro no guarda almacén, lo hereda de su venta. Mismo criterio que paymentJournalsReport,
  // que resuelve la sucursal con una subconsulta en vez de reintroducir el JOIN.
  let whPay = '';
  if (Array.isArray(allowedWarehouses)) {
    const ids = allowedWarehouses.filter(Number.isInteger);
    whPay = ids.length
      ? `AND p.sale_id IN (SELECT id FROM sales WHERE warehouse_id IN (${ids.join(',')}))`
      : 'AND FALSE';
  }

  // Recorte por serie de facturación. Vive en la venta, así que cada consulta lo aplica sobre
  // su alias de sales; los cobros, que no pasan por sales, lo resuelven con subconsulta igual
  // que la sucursal. Sin serie pedida todos estos fragmentos quedan vacíos.
  const se = buildSerieScope(serie_ids);
  const seriesPedidas = idList(serie_ids);
  const sePay = seriesPedidas
    ? `AND p.sale_id IN (SELECT id FROM sales WHERE serie_id IN (${seriesPedidas.join(',')}))`
    : '';

  const [summary, byMethod, byDay, byEmployee, byHour, bySerie] = await Promise.all([
    sequelize.query(
      // Resumen del período, todo sobre lo DESPACHADO: la mercancía salió del inventario, se
      // haya cobrado o no. El WHERE lo recorta una sola vez para que las siete cifras hablen
      // del mismo conjunto —antes el conteo iba sin filtro de estado y contaba las anuladas,
      // así que monto ÷ ventas no daba el ticket promedio que la pantalla mostraba al lado.
      `SELECT
         COUNT(*)::int AS total_sales,
         (COALESCE(SUM(total), 0) -
          COALESCE((SELECT SUM(r.total) FROM returns r JOIN sales s2 ON r.sale_id = s2.id
                    WHERE r.status <> 'anulado' AND s2.status IN (${DISPATCHED_SQL}) ${tcS2} ${wh('s2')} ${se('s2')} ${dS2}), 0))::float AS total_revenue,
         COALESCE(AVG(total), 0)::float AS avg_ticket,
         COALESCE(MAX(total), 0)::float AS max_sale,
         COALESCE(MIN(total), 0)::float AS min_sale,
         -- Lo despachado que todavía no se cobró. Es el complemento exacto de lo cobrado
         -- dentro de este mismo WHERE, así que facturado − cobrado = esto.
         COUNT(CASE WHEN status IN (${UNPAID_SQL}) THEN 1 END)::int AS pending_count,
         COALESCE(SUM(CASE WHEN status IN (${UNPAID_SQL}) THEN total ELSE 0 END), 0)::float AS pending_amount,
         COALESCE((SELECT SUM(r.total) FROM returns r JOIN sales s2 ON r.sale_id = s2.id
                    WHERE r.status <> 'anulado' AND s2.status IN (${DISPATCHED_SQL}) ${tcS2} ${wh('s2')} ${se('s2')} ${dS2}), 0)::float AS total_returned,
         -- Cuánto de esa facturación se perdonó en el período. El total_revenue de arriba la
         -- incluye —la venta ocurrió—, así que sin esta cifra no habría cómo distinguir lo
         -- que entró a caja de lo que se dejó de cobrar: la exoneración no genera egreso.
         COALESCE(SUM(forgiven_amount), 0)::float AS total_forgiven,
         -- Las anuladas no son ventas y por eso quedan fuera de todo lo anterior, pero el
         -- volumen bajó al dejar de contarlas: se publican aparte para que el cambio de
         -- cifra tenga dónde explicarse.
         (SELECT COUNT(*) FROM sales WHERE status = 'anulado' ${tc} ${wh()} ${se()} ${dR})::int AS cancelled_count
       FROM sales
       WHERE status IN (${DISPATCHED_SQL}) ${tc} ${wh()} ${se()} ${dR}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    // Canales de pago: cuánto entró por cada diario en el período.
    //
    // Se corta por la fecha del cobro (p.created_at), no por la de la venta. Antes iba por
    // la venta y eso hacía que el mismo día diera dos cifras distintas según dónde se lo
    // mirara: una factura del 28 cobrada el 29 sumaba acá pero no en la matriz de cobros por
    // día ni en Contabilidad → Pagos, que siempre midieron el movimiento de caja. La
    // diferencia aparecía justo donde más duele, al cuadrar un punto contra el banco.
    //
    // Por lo mismo se cuenta COUNT(p.id) —cobros, que es lo que dice la etiqueta "trans."— y
    // no ventas distintas, y desaparece el JOIN a sales: un cobro pertenece a su diario haya
    // pasado lo que haya pasado después con la factura. La consecuencia buscada es que esta
    // lista ya no tiene por qué sumar el ingreso bruto del período: lo pendiente por cobrar
    // no está acá, y lo cobrado hoy de una venta vieja sí.
    //
    // Cada diario se publica en las DOS monedas, como la matriz de cobros por día: `total`
    // en base es lo único sumable entre diarios de distinta moneda —de ahí salen el total y
    // los porcentajes—, pero lo que el cajero contó y lo que dice el estado de cuenta del
    // banco son los bolívares de `total_journal`. Mostrar solo la referencia obligaba a
    // multiplicar de cabeza por la tasa para cuadrar un punto de venta.
    //
    // amount está en moneda base y exchange_rate es la tasa aplicada en ese cobro, así que el
    // producto devuelve el monto en la moneda del diario a la tasa del día en que se cobró
    // —no a la de hoy, que es lo que descuadraba el pie del listado de pagos—.
    sequelize.query(
      `SELECT
         COALESCE(pj.name, 'Sin diario') AS method_name,
         COALESCE(pj.type, 'otro') AS method_type,
         COALESCE(c.symbol, 'Ref.') AS currency_symbol,
         COALESCE(c.is_base, true) AS is_base,
         COUNT(p.id)::int AS count,
         COALESCE(SUM(p.amount), 0)::float AS total,
         COALESCE(SUM(p.amount * COALESCE(p.exchange_rate, 1)), 0)::float AS total_journal
       FROM payments p
       LEFT JOIN payment_journals pj ON p.payment_journal_id = pj.id
       LEFT JOIN currencies c ON c.id = pj.currency_id
       WHERE p.payment_journal_id IS NOT NULL ${tcP} ${whPay} ${sePay} ${dP}
       GROUP BY pj.id, pj.name, pj.type, c.symbol, c.is_base
       ORDER BY total DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT ${diaR} AS day, COUNT(*)::int AS count,
              COALESCE(SUM(total), 0)::float AS revenue
       FROM sales
       WHERE status IN (${DISPATCHED_SQL}) ${tc} ${wh()} ${se()} ${dR}
       GROUP BY ${diaR}
       ORDER BY day ASC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT e.full_name AS employee_name,
              COUNT(s.id)::int AS count,
              COALESCE(SUM(s.total), 0)::float AS revenue,
              COALESCE(AVG(s.total), 0)::float AS avg_ticket
       FROM sales s
       LEFT JOIN employees e ON s.employee_id = e.id
       WHERE s.status IN (${DISPATCHED_SQL}) ${tcS} ${wh('s')} ${se('s')} ${dS}
       GROUP BY e.id, e.full_name
       ORDER BY revenue DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE '${TZ}')::int AS hour,
              COUNT(*)::int AS count,
              COALESCE(SUM(total), 0)::float AS revenue
       FROM sales
       WHERE status IN (${DISPATCHED_SQL}) ${tc} ${wh()} ${se()} ${dR}
       GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE '${TZ}')
       ORDER BY hour ASC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    // Facturación por serie. Con un punto de venta por caja —o una serie por sucursal— es el
    // corte que dice cuánto emitió cada numeración, y es además con el que se cuadra contra
    // el correlativo. Mismo criterio de "venta realizada" que el resto del reporte.
    //
    // Una venta sin serie cae en "Sin serie": son las cuentas que aún no llegaron a factura.
    sequelize.query(
      `SELECT COALESCE(se.name, 'Sin serie') AS serie_name,
              COALESCE(se.prefix, '') AS prefix,
              COUNT(s.id)::int AS count,
              COALESCE(SUM(s.total), 0)::float AS revenue,
              MIN(s.invoice_number) AS first_invoice,
              MAX(s.invoice_number) AS last_invoice
       FROM sales s
       LEFT JOIN series se ON s.serie_id = se.id
       WHERE s.status IN (${DISPATCHED_SQL}) ${tcS} ${wh('s')} ${se('s')} ${dS}
       GROUP BY se.id, se.name, se.prefix
       ORDER BY revenue DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
  ]);

  const s = summary[0] || {};
  return {
    summary: {
      total_sales:    parseInt(s.total_sales    || 0),
      total_revenue:  parseFloat(s.total_revenue  || 0),
      avg_ticket:     parseFloat(s.avg_ticket     || 0),
      max_sale:       parseFloat(s.max_sale       || 0),
      min_sale:       parseFloat(s.min_sale       || 0),
      pending_count:  parseInt(s.pending_count  || 0),
      pending_amount: parseFloat(s.pending_amount || 0),
      total_returned: parseFloat(s.total_returned || 0),
      total_forgiven: parseFloat(s.total_forgiven || 0),
      cancelled_count: parseInt(s.cancelled_count || 0),
    },
    by_method:   byMethod,
    by_day:      byDay,
    by_employee: byEmployee,
    by_hour:     byHour,
    by_serie:    bySerie,
  };
}

module.exports = salesReport;
