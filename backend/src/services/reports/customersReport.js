const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause } = require("./shared");

async function customersReport({ date_from, date_to, inactive_days = 45, company_id, tc, tcS, tcC, rep }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS = dateClause(df, dt, 's');
  const dC = dateClause(df, dt, 'c');
  const dR = dateClause(df, dt);
  const inactiveDays = parseInt(inactive_days);

  const [topCustomers, inactiveCustomers, newCustomers, ticketStats, repeatRate] = await Promise.all([
    sequelize.query(
      `SELECT c.id, c.name, c.phone, c.rif,
              COUNT(DISTINCT s.id)::int AS purchase_count,
              COALESCE(SUM(s.total), 0)::float AS total_spent,
              COALESCE(AVG(s.total), 0)::float AS avg_ticket,
              MAX(s.created_at) AS last_purchase
       FROM customers c
       JOIN sales s ON s.customer_id = c.id
       WHERE c.type = 'cliente' ${tcS} ${dS}
       GROUP BY c.id, c.name, c.phone, c.rif
       ORDER BY total_spent DESC
       LIMIT 20`,
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
       WHERE c.type = 'cliente' ${tcS}
       GROUP BY c.id, c.name, c.phone, c.rif
       HAVING MAX(s.created_at) < NOW() - (${inactiveDays} * INTERVAL '1 day')
       ORDER BY days_inactive DESC
       LIMIT 30`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT c.id, c.name, c.phone,
              MIN(s.created_at) AS first_purchase,
              COUNT(s.id)::int AS purchase_count,
              COALESCE(SUM(s.total), 0)::float AS total_spent
       FROM customers c
       JOIN sales s ON s.customer_id = c.id
       WHERE c.type = 'cliente' ${tcC} ${dC}
       GROUP BY c.id, c.name, c.phone
       ORDER BY first_purchase DESC
       LIMIT 20`,
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
       WHERE TRUE ${tc} ${dR}
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
         WHERE customer_id IS NOT NULL ${tc} ${dR}
         GROUP BY customer_id
       ) sub ON s.customer_id = sub.customer_id
       WHERE TRUE ${tcS} ${dS}`,
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
  };
}

module.exports = customersReport;
