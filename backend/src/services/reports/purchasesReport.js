const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause } = require("./shared");

async function purchasesReport({ date_from, date_to, company_id, tc, tcP, rep }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dR  = dateClause(df, dt);
  const dP  = dateClause(df, dt, 'p');

  const [summary, bySupplier, byDay, topProducts] = await Promise.all([
    sequelize.query(
      `SELECT
         COUNT(*)::int AS total_orders,
         COALESCE(SUM(total), 0)::float AS total_cost,
         COALESCE(AVG(total), 0)::float AS avg_order,
         COALESCE(MAX(total), 0)::float AS max_order
       FROM purchases
       WHERE TRUE ${tc} ${dR}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COALESCE(c.name, p.supplier_name, 'Sin proveedor') AS supplier_name,
         COUNT(p.id)::int AS order_count,
         COALESCE(SUM(p.total), 0)::float AS total_cost
       FROM purchases p
       LEFT JOIN customers c ON p.supplier_id = c.id
       WHERE TRUE ${tcP} ${dP}
       GROUP BY c.name, p.supplier_name
       ORDER BY total_cost DESC
       LIMIT 20`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT DATE(created_at) AS day, COUNT(*)::int AS count,
              COALESCE(SUM(total), 0)::float AS cost
       FROM purchases
       WHERE TRUE ${tc} ${dR}
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         pi.product_id, pi.product_name,
         COUNT(DISTINCT pi.purchase_id)::int AS order_count,
         COALESCE(SUM(pi.package_qty * pi.package_size), 0)::float AS total_units,
         COALESCE(SUM(pi.package_qty * pi.package_price), 0)::float AS total_cost
       FROM purchase_items pi
       JOIN purchases p ON pi.purchase_id = p.id
       WHERE TRUE ${tcP} ${dP}
       GROUP BY pi.product_id, pi.product_name
       ORDER BY total_cost DESC
       LIMIT 15`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
  ]);

  return {
    summary:      summary[0] || {},
    by_supplier:  bySupplier,
    by_day:       byDay,
    top_products: topProducts,
  };
}

module.exports = purchasesReport;
