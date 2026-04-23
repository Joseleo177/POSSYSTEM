const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause } = require("./shared");

async function salesReport({ date_from, date_to, company_id, isSuperuser, tc, tcS, tcS2, rep }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS  = dateClause(df, dt, 's');
  const dR  = dateClause(df, dt);
  const dS2 = dateClause(df, dt, 's2');

  const [summary, byMethod, byDay, byEmployee, byHour] = await Promise.all([
    sequelize.query(
      `SELECT
         COUNT(*)::int AS total_sales,
         (COALESCE(SUM(CASE WHEN status = 'pagado' THEN total ELSE 0 END), 0) -
          COALESCE((SELECT SUM(r.total) FROM returns r JOIN sales s2 ON r.sale_id = s2.id
                    WHERE s2.status = 'pagado' ${tcS2} ${dS2}), 0))::float AS total_revenue,
         COALESCE(AVG(CASE WHEN status = 'pagado' THEN total END), 0)::float AS avg_ticket,
         COALESCE(MAX(CASE WHEN status = 'pagado' THEN total END), 0)::float AS max_sale,
         COALESCE(MIN(CASE WHEN status = 'pagado' THEN total END), 0)::float AS min_sale,
         COUNT(CASE WHEN status IN ('pendiente','parcial') THEN 1 END)::int AS pending_count,
         COALESCE(SUM(CASE WHEN status IN ('pendiente','parcial') THEN total ELSE 0 END), 0)::float AS pending_amount,
         COALESCE((SELECT SUM(r.total) FROM returns r JOIN sales s2 ON r.sale_id = s2.id
                    WHERE s2.status = 'pagado' ${tcS2} ${dS2}), 0)::float AS total_returned
       FROM sales
       WHERE TRUE ${tc} ${dR}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COALESCE(pj.name, 'Sin diario') AS method_name,
         COALESCE(pj.type, 'otro') AS method_type,
         COUNT(DISTINCT p.sale_id)::int AS count,
         COALESCE(SUM(p.amount), 0)::float AS total
       FROM payments p
       LEFT JOIN payment_journals pj ON p.payment_journal_id = pj.id
       JOIN sales s ON p.sale_id = s.id
       WHERE TRUE ${tcS} ${dS}
       GROUP BY pj.id, pj.name, pj.type
       ORDER BY total DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT DATE(created_at) AS day, COUNT(*)::int AS count,
              COALESCE(SUM(total), 0)::float AS revenue
       FROM sales
       WHERE status = 'pagado' ${tc} ${dR}
       GROUP BY DATE(created_at)
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
       WHERE s.status = 'pagado' ${tcS} ${dS}
       GROUP BY e.id, e.full_name
       ORDER BY revenue DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Caracas')::int AS hour,
              COUNT(*)::int AS count,
              COALESCE(SUM(total), 0)::float AS revenue
       FROM sales
       WHERE status = 'pagado' ${tc} ${dR}
       GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Caracas')
       ORDER BY hour ASC`,
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
    },
    by_method:   byMethod,
    by_day:      byDay,
    by_employee: byEmployee,
    by_hour:     byHour,
  };
}

module.exports = salesReport;
