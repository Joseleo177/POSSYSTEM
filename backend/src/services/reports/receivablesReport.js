const { sequelize, Sequelize } = require("../../models");

async function receivablesReport({ company_id, tcS, rep }) {
  const [summary, byCustomer, aging] = await Promise.all([
    sequelize.query(
      `SELECT
         COUNT(*)::int AS total_invoices,
         COALESCE(SUM(total - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id)), 0)::float AS total_balance,
         COALESCE(SUM(total), 0)::float AS total_billed,
         COALESCE(SUM((SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id)), 0)::float AS total_collected
       FROM sales s
       WHERE status IN ('pendiente', 'parcial') ${tcS}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         c.id AS customer_id,
         COALESCE(c.name, 'Sin cliente') AS customer_name,
         c.phone, c.rif,
         COUNT(s.id)::int AS invoice_count,
         COALESCE(SUM(s.total), 0)::float AS total_billed,
         COALESCE(SUM(s.total - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id)), 0)::float AS balance,
         MIN(s.created_at) AS oldest_invoice,
         MAX(s.created_at) AS latest_invoice
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.status IN ('pendiente', 'parcial') ${tcS}
       GROUP BY c.id, c.name, c.phone, c.rif
       ORDER BY balance DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COUNT(CASE WHEN NOW() - created_at <= INTERVAL '30 days' THEN 1 END)::int AS d0_30_count,
         COALESCE(SUM(CASE WHEN NOW() - created_at <= INTERVAL '30 days' THEN total - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id) ELSE 0 END), 0)::float AS d0_30_amount,
         COUNT(CASE WHEN NOW() - created_at BETWEEN INTERVAL '31 days' AND INTERVAL '60 days' THEN 1 END)::int AS d31_60_count,
         COALESCE(SUM(CASE WHEN NOW() - created_at BETWEEN INTERVAL '31 days' AND INTERVAL '60 days' THEN total - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id) ELSE 0 END), 0)::float AS d31_60_amount,
         COUNT(CASE WHEN NOW() - created_at > INTERVAL '60 days' THEN 1 END)::int AS d60_plus_count,
         COALESCE(SUM(CASE WHEN NOW() - created_at > INTERVAL '60 days' THEN total - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id) ELSE 0 END), 0)::float AS d60_plus_amount
       FROM sales s
       WHERE status IN ('pendiente', 'parcial') ${tcS}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
  ]);

  return {
    summary:     summary[0] || {},
    by_customer: byCustomer,
    aging:       aging[0]   || {},
  };
}

module.exports = receivablesReport;
