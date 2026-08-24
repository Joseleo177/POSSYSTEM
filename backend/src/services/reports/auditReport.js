const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause, SETTLED_SQL } = require("./shared");

async function auditReport({ date_from, date_to, limit, company_id, tcS, rep, wh }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS = dateClause(df, dt, 's');
  const dR = dateClause(df, dt, 'r');
  const lim = parseInt(limit) || 0;   // 0 = usar defaults de pantalla

  // Aplica al desempeño por empleado y a los descuentos: son ventas concretadas, no
  // intentos. Antes un cajero cargaba en su total las que se le anularon, y un descuento
  // sobre una venta anulada figuraba como descuento otorgado. Las devoluciones NO llevan
  // este filtro: se miden sobre la tabla returns, que ya es de por sí lo devuelto.
  const stS = `AND s.status IN (${SETTLED_SQL})`;

  const [returnsSummary, returnsList, byEmployee, discounts] = await Promise.all([
    sequelize.query(
      `SELECT
         COUNT(r.id)::int AS return_count,
         COALESCE(SUM(r.total), 0)::float AS total_returned,
         COALESCE(AVG(r.total), 0)::float AS avg_return
       FROM returns r
       JOIN sales s ON r.sale_id = s.id
       WHERE r.status <> 'anulado' ${tcS} ${wh('s')} ${dR}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT r.id, r.sale_id, r.reason, r.total, r.created_at,
              e.full_name AS employee_name,
              c.name AS customer_name
       FROM returns r
       LEFT JOIN employees e ON r.employee_id = e.id
       LEFT JOIN sales s ON r.sale_id = s.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE r.status <> 'anulado' ${tcS} ${wh('s')} ${dR}
       ORDER BY r.created_at DESC
       LIMIT ${lim || 50}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COALESCE(e.full_name, 'Sin empleado') AS employee_name,
         COUNT(s.id)::int AS sale_count,
         COALESCE(SUM(s.total), 0)::float AS revenue,
         COALESCE(AVG(s.total), 0)::float AS avg_ticket,
         COALESCE(MAX(s.total), 0)::float AS max_sale,
         COALESCE(SUM(s.discount_amount), 0)::float AS total_discounts,
         COUNT(s.id) FILTER (WHERE s.discount_amount > 0)::int AS discounted_sales
       FROM sales s
       LEFT JOIN employees e ON s.employee_id = e.id
       WHERE TRUE ${tcS} ${wh('s')} ${dS} ${stS}
       GROUP BY e.id, e.full_name
       ORDER BY revenue DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT s.id, s.total, s.discount_amount, s.created_at,
              COALESCE(e.full_name, '—') AS employee_name,
              COALESCE(c.name, 'Sin cliente') AS customer_name,
              ROUND((s.discount_amount / NULLIF(s.total + s.discount_amount, 0) * 100)::numeric, 1) AS discount_pct
       FROM sales s
       LEFT JOIN employees e ON s.employee_id = e.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.discount_amount > 0 ${tcS} ${wh('s')} ${dS} ${stS}
       ORDER BY discount_pct DESC
       LIMIT ${lim || 30}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
  ]);

  return {
    returns_summary: returnsSummary[0] || {},
    returns_list:    returnsList,
    by_employee:     byEmployee,
    discounts,
  };
}

module.exports = auditReport;
