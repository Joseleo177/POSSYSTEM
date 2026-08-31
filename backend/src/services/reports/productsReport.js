const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause, buildSerieScope, SETTLED_SQL } = require("./shared");

async function productsReport({ date_from, date_to, serie_ids, limit = 20, company_id, tcS, tcP, rep, wh, hours }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS = dateClause(df, dt, 's', hours);
  // Mismo recorte por serie que salesReport: este reporte alimenta el detalle por producto
  // del PDF de ventas, y con filtros distintos las líneas no sumarían el total que lo encabeza.
  const se = buildSerieScope(serie_ids);
  const lim = parseInt(limit);

  // Mismo criterio de "venta realizada" que salesReport y marginsReport: sin esto
  // las anuladas contaban como ventas y productos que nunca se vendieron aparecían
  // en el top (y desaparecían del listado de estancados, que es el efecto inverso).
  // Lo vendido incluye las facturas exoneradas: la mercancía salió igual, solo que el saldo
  // se perdonó en vez de cobrarse (ver utils/saleBalance).
  const stS = `AND s.status IN (${SETTLED_SQL})`;

  // Valorizar existencias: cada una vale lo que costó donde está, no lo que dice el catálogo.
  // Se suma fila por fila porque el mismo producto pudo costar distinto en cada sucursal.
  const valueCost = `(SELECT COALESCE(SUM(qty * COALESCE(cost_price, p.cost_price, 0)), 0)
                        FROM product_stock WHERE product_id = p.id AND company_id = p.company_id ${wh()})`;
  const valueSale = `(SELECT COALESCE(SUM(qty * COALESCE(price, p.price)), 0)
                        FROM product_stock WHERE product_id = p.id AND company_id = p.company_id ${wh()})`;

  const [topByRevenue, topByQty, slowMovers, stockValue] = await Promise.all([
    sequelize.query(
      `SELECT si.product_id,
              si.name AS product_name,
              COALESCE(p.category_id, 0) AS category_id,
              COUNT(DISTINCT si.sale_id)::int AS sale_count,
              COALESCE(SUM(si.quantity), 0)::float AS total_qty,
              COALESCE(SUM(si.subtotal), 0)::float AS total_revenue,
              COALESCE(AVG(si.price), 0)::float AS avg_price
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       WHERE TRUE ${tcS} ${wh('s')} ${se('s')} ${dS} ${stS}
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
       WHERE TRUE ${tcS} ${wh('s')} ${se('s')} ${dS} ${stS}
       GROUP BY si.product_id, si.name
       ORDER BY total_qty DESC
       LIMIT ${lim}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT p.id, p.name,
              (SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = p.id AND company_id = p.company_id ${wh()}) AS stock,
              p.price, p.min_stock, p.cost_price
       FROM products p
       WHERE p.is_service = false AND p.is_combo = false ${tcP}
         AND (SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = p.id AND company_id = p.company_id ${wh()}) > 0
         AND p.id NOT IN (
           SELECT DISTINCT si.product_id
           FROM sale_items si
           JOIN sales s ON si.sale_id = s.id
           WHERE TRUE ${tcS} ${wh('s')} ${se('s')} ${dS} ${stS}
         )
       ORDER BY p.name ASC
       LIMIT 20`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COUNT(*)::int AS product_count,
         COALESCE(SUM(${valueSale}), 0)::float AS total_value_sale,
         COALESCE(SUM(${valueCost}), 0)::float AS total_value_cost
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
