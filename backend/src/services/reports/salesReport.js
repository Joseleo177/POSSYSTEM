const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause, localDate, TZ, SETTLED_SQL } = require("./shared");

async function salesReport({ date_from, date_to, company_id, isSuperuser, tc, tcS, tcS2, tcP, rep, wh, allowedWarehouses }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS  = dateClause(df, dt, 's');
  const dR  = dateClause(df, dt);
  const dS2 = dateClause(df, dt, 's2');
  // Los canales de pago se cortan por la fecha del COBRO, no por la de la venta: ver el
  // comentario de esa consulta más abajo.
  const dP  = dateClause(df, dt, 'p');

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

  const [summary, byMethod, byDay, byEmployee, byHour, bySerie] = await Promise.all([
    sequelize.query(
      `SELECT
         COUNT(*)::int AS total_sales,
         (COALESCE(SUM(CASE WHEN status IN (${SETTLED_SQL}) THEN total ELSE 0 END), 0) -
          COALESCE((SELECT SUM(r.total) FROM returns r JOIN sales s2 ON r.sale_id = s2.id
                    WHERE r.status <> 'anulado' AND s2.status IN (${SETTLED_SQL}) ${tcS2} ${wh('s2')} ${dS2}), 0))::float AS total_revenue,
         COALESCE(AVG(CASE WHEN status IN (${SETTLED_SQL}) THEN total END), 0)::float AS avg_ticket,
         COALESCE(MAX(CASE WHEN status IN (${SETTLED_SQL}) THEN total END), 0)::float AS max_sale,
         COALESCE(MIN(CASE WHEN status IN (${SETTLED_SQL}) THEN total END), 0)::float AS min_sale,
         COUNT(CASE WHEN status IN ('pendiente','parcial') THEN 1 END)::int AS pending_count,
         COALESCE(SUM(CASE WHEN status IN ('pendiente','parcial') THEN total ELSE 0 END), 0)::float AS pending_amount,
         COALESCE((SELECT SUM(r.total) FROM returns r JOIN sales s2 ON r.sale_id = s2.id
                    WHERE r.status <> 'anulado' AND s2.status IN (${SETTLED_SQL}) ${tcS2} ${wh('s2')} ${dS2}), 0)::float AS total_returned,
         -- Cuánto de esa facturación se perdonó en el período. El total_revenue de arriba la
         -- incluye —la venta ocurrió—, así que sin esta cifra no habría cómo distinguir lo
         -- que entró a caja de lo que se dejó de cobrar: la exoneración no genera egreso.
         COALESCE(SUM(CASE WHEN status IN (${SETTLED_SQL}) THEN forgiven_amount ELSE 0 END), 0)::float AS total_forgiven
       FROM sales
       WHERE TRUE ${tc} ${wh()} ${dR}`,
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
    sequelize.query(
      `SELECT
         COALESCE(pj.name, 'Sin diario') AS method_name,
         COALESCE(pj.type, 'otro') AS method_type,
         COUNT(p.id)::int AS count,
         COALESCE(SUM(p.amount), 0)::float AS total
       FROM payments p
       LEFT JOIN payment_journals pj ON p.payment_journal_id = pj.id
       WHERE p.payment_journal_id IS NOT NULL ${tcP} ${whPay} ${dP}
       GROUP BY pj.id, pj.name, pj.type
       ORDER BY total DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT ${localDate('created_at')} AS day, COUNT(*)::int AS count,
              COALESCE(SUM(total), 0)::float AS revenue
       FROM sales
       WHERE status IN (${SETTLED_SQL}) ${tc} ${wh()} ${dR}
       GROUP BY ${localDate('created_at')}
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
       WHERE s.status IN (${SETTLED_SQL}) ${tcS} ${wh('s')} ${dS}
       GROUP BY e.id, e.full_name
       ORDER BY revenue DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE '${TZ}')::int AS hour,
              COUNT(*)::int AS count,
              COALESCE(SUM(total), 0)::float AS revenue
       FROM sales
       WHERE status IN (${SETTLED_SQL}) ${tc} ${wh()} ${dR}
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
       WHERE s.status IN (${SETTLED_SQL}) ${tcS} ${wh('s')} ${dS}
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
    },
    by_method:   byMethod,
    by_day:      byDay,
    by_employee: byEmployee,
    by_hour:     byHour,
    by_serie:    bySerie,
  };
}

module.exports = salesReport;
