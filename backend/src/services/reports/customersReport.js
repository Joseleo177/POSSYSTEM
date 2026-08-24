const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause, SETTLED_SQL } = require("./shared");

async function customersReport({ date_from, date_to, inactive_days = 45, limit, offset, company_id, tc, tcS, tcC, rep, wh }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS = dateClause(df, dt, 's');
  const dC = dateClause(df, dt, 'c');
  const dR = dateClause(df, dt);
  const inactiveDays = parseInt(inactive_days);
  // Paginación real. Antes había un LIMIT fijo por lista (20/30/20) sin forma de pedir la
  // página siguiente: el reporte mostraba un top recortado y el resto de los clientes era
  // inalcanzable. La paginación del front era local sobre ese recorte, así que ni siquiera
  // llegaba a activarse. El export completo sigue funcionando: pide un limit alto.
  const lim = Math.min(Math.max(parseInt(limit) || 25, 1), 5000);
  const off = Math.max(parseInt(offset) || 0, 0);

  // Aquí hacen falta dos criterios distintos y no uno solo. Para plata ("cuánto gastó")
  // vale lo efectivamente cobrado. Para fechas ("cuándo compró por última vez") hay que
  // contar también lo pendiente y lo parcial: si no, un cliente que se llevó mercancía
  // a crédito ayer saldría listado como inactivo desde hace meses.
  // Sin ninguno de los dos, un cliente con todas sus ventas anuladas figuraba de top.
  // El recorte por sucursal viaja junto a estos criterios: toda consulta del reporte usa
  // alguno de los cuatro, así que no queda ninguna sin acotar.
  // La exonerada cuenta como compra cerrada: el cliente se llevó la mercancía, y dejarla
  // fuera lo haría figurar como inactivo o rebajaría su ticket promedio sin motivo.
  const stPagado  = `AND status IN (${SETTLED_SQL}) ${wh()}`;
  const stPagadoS = `AND s.status IN (${SETTLED_SQL}) ${wh('s')}`;
  const stCompra  = `AND status NOT IN ('anulado','borrador','espera') ${wh()}`;
  const stCompraS = `AND s.status NOT IN ('anulado','borrador','espera') ${wh('s')}`;

  const [topCustomers, inactiveCustomers, newCustomers, ticketStats, repeatRate, counts] = await Promise.all([
    sequelize.query(
      `SELECT c.id, c.name, c.phone, c.rif,
              COUNT(DISTINCT s.id)::int AS purchase_count,
              COALESCE(SUM(s.total), 0)::float AS total_spent,
              COALESCE(AVG(s.total), 0)::float AS avg_ticket,
              MAX(s.created_at) AS last_purchase
       FROM customers c
       JOIN sales s ON s.customer_id = c.id
       WHERE c.type = 'cliente' ${tcS} ${dS} ${stPagadoS}
       GROUP BY c.id, c.name, c.phone, c.rif
       ORDER BY total_spent DESC
       LIMIT ${lim} OFFSET ${off}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT c.id, c.name, c.phone, c.rif,
              COUNT(s.id)::int AS total_purchases,
              COALESCE(SUM(s.total), 0)::float AS lifetime_value,
              MAX(s.created_at) AS last_purchase,
              EXTRACT(DAY FROM NOW() - MAX(s.created_at))::int AS days_inactive
       FROM customers c
       JOIN sales s ON s.customer_id = c.id
       WHERE c.type = 'cliente' ${tcS} ${stCompraS}
       GROUP BY c.id, c.name, c.phone, c.rif
       HAVING MAX(s.created_at) < NOW() - (${inactiveDays} * INTERVAL '1 day')
       ORDER BY days_inactive DESC
       LIMIT ${lim} OFFSET ${off}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT c.id, c.name, c.phone,
              MIN(s.created_at) AS first_purchase,
              COUNT(s.id)::int AS purchase_count,
              COALESCE(SUM(s.total), 0)::float AS total_spent
       FROM customers c
       JOIN sales s ON s.customer_id = c.id
       WHERE c.type = 'cliente' ${tcC} ${dC} ${stCompraS}
       GROUP BY c.id, c.name, c.phone
       ORDER BY first_purchase DESC
       LIMIT ${lim} OFFSET ${off}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         CASE
           WHEN total < 10   THEN '< $10'
           WHEN total < 50   THEN '$10 – $50'
           WHEN total < 100  THEN '$50 – $100'
           WHEN total < 500  THEN '$100 – $500'
           ELSE '> $500'
         END AS range,
         COUNT(*)::int AS count,
         COALESCE(SUM(total), 0)::float AS revenue
       FROM sales
       WHERE TRUE ${tc} ${dR} ${stPagado}
       GROUP BY range
       ORDER BY MIN(total)`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COUNT(DISTINCT s.customer_id) FILTER (WHERE s.customer_id IS NOT NULL)::int AS identified_customers,
         COUNT(DISTINCT s.customer_id) FILTER (WHERE purchase_count > 1)::int AS repeat_customers
       FROM sales s
       JOIN (
         SELECT customer_id, COUNT(*) AS purchase_count
         FROM sales
         WHERE customer_id IS NOT NULL ${tc} ${dR} ${stCompra}
         GROUP BY customer_id
       ) sub ON s.customer_id = sub.customer_id
       WHERE TRUE ${tcS} ${dS} ${stCompraS}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    // Totales sin paginar, con los mismos filtros y agrupaciones que cada lista. Sin esto el
    // front no sabe cuántas páginas hay y su paginador no puede pasar de la primera.
    sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM (
            SELECT c.id FROM customers c JOIN sales s ON s.customer_id = c.id
            WHERE c.type = 'cliente' ${tcS} ${dS} ${stPagadoS}
            GROUP BY c.id
          ) t)::int AS top_total,
         (SELECT COUNT(*) FROM (
            SELECT c.id FROM customers c JOIN sales s ON s.customer_id = c.id
            WHERE c.type = 'cliente' ${tcS} ${stCompraS}
            GROUP BY c.id
            HAVING MAX(s.created_at) < NOW() - (${inactiveDays} * INTERVAL '1 day')
          ) t)::int AS inactive_total,
         (SELECT COUNT(*) FROM (
            SELECT c.id FROM customers c JOIN sales s ON s.customer_id = c.id
            WHERE c.type = 'cliente' ${tcC} ${dC} ${stCompraS}
            GROUP BY c.id
          ) t)::int AS new_total`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
  ]);

  return {
    top_customers:       topCustomers,
    inactive_customers:  inactiveCustomers,
    new_customers:       newCustomers,
    ticket_distribution: ticketStats,
    repeat_rate:         repeatRate[0] || {},
    inactive_days:       inactiveDays,
    totals: {
      top:      counts[0]?.top_total      || 0,
      inactive: counts[0]?.inactive_total || 0,
      new:      counts[0]?.new_total      || 0,
    },
    page_size: lim,
  };
}

module.exports = customersReport;
