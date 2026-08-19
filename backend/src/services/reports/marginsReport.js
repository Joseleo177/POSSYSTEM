const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause, localDate } = require("./shared");

async function marginsReport({ date_from, date_to, limit, company_id, tcS, rep, wh }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS = dateClause(df, dt, 's');
  const lim = parseInt(limit) || 0;   // 0 = usar defaults de pantalla

  // Mismo criterio de "ingreso realizado" que salesReport. Va en una sola constante
  // porque antes solo lo aplicaba la consulta por día: el resumen y los desgloses
  // sumaban también las anuladas, así que la pantalla se contradecía a sí misma.
  const stS = `AND s.status = 'pagado'`;

  // Costo unitario a usar: primero el congelado en la venta, luego el del producto, y para
  // los combos —que no guardan costo propio— la suma de sus componentes. Sin este último
  // respaldo, un combo vendido antes de que existiera si.cost_price no mostraba margen nunca.
  const unitCost = `COALESCE(si.cost_price, p.cost_price, (
           SELECT SUM(COALESCE(ing.cost_price, 0) * pci.quantity)
             FROM product_combo_items pci
             JOIN products ing ON ing.id = pci.product_id
            WHERE pci.combo_id = p.id
         ), 0)`;

  const [byProduct, byCategory, summary, byDay] = await Promise.all([
    sequelize.query(
      `SELECT
         si.product_id,
         si.name AS product_name,
         COALESCE(c.name,'Sin categoría') AS category_name,
         COUNT(DISTINCT si.sale_id)::int AS sales_count,
         COALESCE(SUM(si.quantity), 0)::float AS total_qty,
         COALESCE(SUM(si.subtotal), 0)::float AS revenue,
         COALESCE(SUM(si.quantity * ${unitCost}), 0)::float AS total_cost,
         COALESCE(SUM(si.subtotal) - SUM(si.quantity * ${unitCost}), 0)::float AS gross_margin,
         CASE WHEN SUM(si.subtotal) > 0
              THEN ROUND(((SUM(si.subtotal) - SUM(si.quantity * ${unitCost})) / SUM(si.subtotal) * 100)::numeric, 1)
              ELSE 0
         END AS margin_pct
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE TRUE ${tcS} ${wh('s')} ${dS} ${stS}
         AND ${unitCost} > 0
       GROUP BY si.product_id, si.name, c.name
       ORDER BY gross_margin DESC
       LIMIT ${lim || 30}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COALESCE(c.name,'Sin categoría') AS category_name,
         COUNT(DISTINCT si.product_id)::int AS product_count,
         COALESCE(SUM(si.subtotal), 0)::float AS revenue,
         COALESCE(SUM(si.quantity * ${unitCost}), 0)::float AS total_cost,
         COALESCE(SUM(si.subtotal) - SUM(si.quantity * ${unitCost}), 0)::float AS gross_margin,
         CASE WHEN SUM(si.subtotal) > 0
              THEN ROUND(((SUM(si.subtotal) - SUM(si.quantity * ${unitCost})) / SUM(si.subtotal) * 100)::numeric, 1)
              ELSE 0
         END AS margin_pct
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE TRUE ${tcS} ${wh('s')} ${dS} ${stS}
       GROUP BY c.name
       ORDER BY gross_margin DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COALESCE(SUM(si.subtotal), 0)::float AS total_revenue,
         COALESCE(SUM(si.quantity * ${unitCost}), 0)::float AS total_cost,
         COALESCE(SUM(si.subtotal) - SUM(si.quantity * ${unitCost}), 0)::float AS total_margin,
         CASE WHEN SUM(si.subtotal) > 0
              THEN ROUND(((SUM(si.subtotal) - SUM(si.quantity * ${unitCost})) / SUM(si.subtotal) * 100)::numeric, 1)
              ELSE 0
         END AS avg_margin_pct,
         COUNT(DISTINCT si.product_id)::int AS products_with_cost
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       WHERE COALESCE(si.cost_price, p.cost_price) > 0 ${tcS} ${wh('s')} ${dS} ${stS}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         ${localDate('s.created_at')} AS day,
         COALESCE(SUM(si.subtotal), 0)::float AS revenue,
         COALESCE(SUM(si.quantity * ${unitCost}), 0)::float AS cost,
         COALESCE(SUM(si.subtotal) - SUM(si.quantity * ${unitCost}), 0)::float AS profit,
         CASE WHEN SUM(si.subtotal) > 0
              THEN ROUND(((SUM(si.subtotal) - SUM(si.quantity * ${unitCost})) / SUM(si.subtotal) * 100)::numeric, 1)
              ELSE 0
         END AS margin_pct
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       WHERE TRUE ${tcS} ${wh('s')} ${dS} ${stS}
       GROUP BY ${localDate('s.created_at')}
       ORDER BY day ASC`,
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
    by_day:        byDay,
  };
}

module.exports = marginsReport;
