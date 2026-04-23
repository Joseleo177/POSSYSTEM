const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause } = require("./shared");

async function productsReport({ date_from, date_to, limit = 20, company_id, tcS, tcP, rep }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS = dateClause(df, dt, 's');
  const lim = parseInt(limit);

  const [topByRevenue, topByQty, slowMovers, stockValue] = await Promise.all([
    sequelize.query(
      `SELECT si.product_id,
              si.name AS product_name,
              COALESCE(p.category_id, 0) AS category_id,
              COUNT(DISTINCT si.sale_id)::int AS sale_count,
              COALESCE(SUM(si.quantity), 0)::float AS total_qty,
              COALESCE(SUM(si.subtotal), 0)::float AS total_revenue,
              COALESCE(AVG(si.unit_price), 0)::float AS avg_price
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       WHERE TRUE ${tcS} ${dS}
       GROUP BY si.product_id, si.name, p.category_id
       ORDER BY total_revenue DESC
       LIMIT ${lim}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT si.product_id, si.name AS product_name,
              COALESCE(SUM(si.quantity), 0)::float AS total_qty,
              COALESCE(SUM(si.subtotal), 0)::float AS total_revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE TRUE ${tcS} ${dS}
       GROUP BY si.product_id, si.name
       ORDER BY total_qty DESC
       LIMIT ${lim}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT p.id, p.name,
              (SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = p.id AND company_id = p.company_id) AS stock,
              p.price, p.min_stock, p.cost_price
       FROM products p
       WHERE p.is_service = false AND p.is_combo = false ${tcP}
         AND (SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = p.id AND company_id = p.company_id) > 0
         AND p.id NOT IN (
           SELECT DISTINCT si.product_id
           FROM sale_items si
           JOIN sales s ON si.sale_id = s.id
           WHERE TRUE ${tcS} ${dS}
         )
       ORDER BY p.name ASC
       LIMIT 20`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COUNT(*)::int AS product_count,
         COALESCE(SUM((SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = p.id AND company_id = p.company_id) * price), 0)::float AS total_value_sale,
         COALESCE(SUM((SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = p.id AND company_id = p.company_id) * COALESCE(cost_price, 0)), 0)::float AS total_value_cost
       FROM products p
       WHERE is_combo = false AND is_service = false ${tcP}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
  ]);

  return {
    top_by_revenue: topByRevenue,
    top_by_qty:     topByQty,
    slow_movers:    slowMovers,
    stock_value:    stockValue[0] || { product_count: 0, total_value_sale: 0, total_value_cost: 0 },
  };
}

module.exports = productsReport;
