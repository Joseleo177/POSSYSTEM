const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause } = require("./shared");

async function marginsReport({ date_from, date_to, company_id, tcS, rep }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS = dateClause(df, dt, 's');

  const [byProduct, byCategory, summary] = await Promise.all([
    sequelize.query(
      `SELECT
         si.product_id,
         si.name AS product_name,
         COALESCE(c.name,'Sin categoría') AS category_name,
         COUNT(DISTINCT si.sale_id)::int AS sales_count,
         COALESCE(SUM(si.quantity), 0)::float AS total_qty,
         COALESCE(SUM(si.subtotal), 0)::float AS revenue,
         COALESCE(SUM(si.quantity * COALESCE(p.cost_price, 0)), 0)::float AS total_cost,
         COALESCE(SUM(si.subtotal) - SUM(si.quantity * COALESCE(p.cost_price, 0)), 0)::float AS gross_margin,
         CASE WHEN SUM(si.subtotal) > 0
              THEN ROUND(((SUM(si.subtotal) - SUM(si.quantity * COALESCE(p.cost_price, 0))) / SUM(si.subtotal) * 100)::numeric, 1)
              ELSE 0
         END AS margin_pct
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE TRUE ${tcS} ${dS}
         AND p.cost_price IS NOT NULL AND p.cost_price > 0
       GROUP BY si.product_id, si.name, c.name
       ORDER BY gross_margin DESC
       LIMIT 30`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COALESCE(c.name,'Sin categoría') AS category_name,
         COUNT(DISTINCT si.product_id)::int AS product_count,
         COALESCE(SUM(si.subtotal), 0)::float AS revenue,
         COALESCE(SUM(si.quantity * COALESCE(p.cost_price, 0)), 0)::float AS total_cost,
         COALESCE(SUM(si.subtotal) - SUM(si.quantity * COALESCE(p.cost_price, 0)), 0)::float AS gross_margin,
         CASE WHEN SUM(si.subtotal) > 0
              THEN ROUND(((SUM(si.subtotal) - SUM(si.quantity * COALESCE(p.cost_price, 0))) / SUM(si.subtotal) * 100)::numeric, 1)
              ELSE 0
         END AS margin_pct
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE TRUE ${tcS} ${dS}
       GROUP BY c.name
       ORDER BY gross_margin DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COALESCE(SUM(si.subtotal), 0)::float AS total_revenue,
         COALESCE(SUM(si.quantity * COALESCE(p.cost_price, 0)), 0)::float AS total_cost,
         COALESCE(SUM(si.subtotal) - SUM(si.quantity * COALESCE(p.cost_price, 0)), 0)::float AS total_margin,
         CASE WHEN SUM(si.subtotal) > 0
              THEN ROUND(((SUM(si.subtotal) - SUM(si.quantity * COALESCE(p.cost_price, 0))) / SUM(si.subtotal) * 100)::numeric, 1)
              ELSE 0
         END AS avg_margin_pct,
         COUNT(DISTINCT si.product_id)::int AS products_with_cost
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       WHERE p.cost_price IS NOT NULL AND p.cost_price > 0 ${tcS} ${dS}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
  ]);

  const bottomMargin = [...byProduct]
    .sort((a, b) => parseFloat(a.margin_pct) - parseFloat(b.margin_pct))
    .slice(0, 10);

  return {
    summary:       summary[0] || {},
    by_product:    byProduct,
    bottom_margin: bottomMargin,
    by_category:   byCategory,
  };
}

module.exports = marginsReport;
