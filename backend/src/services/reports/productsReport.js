const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause, buildSerieScope, DISPATCHED_SQL } = require("./shared");

async function productsReport({ date_from, date_to, serie_ids, category_id, subcategory, limit = 20, company_id, tcS, tcP, rep, wh, allowedWarehouses, hours, warehouse_id }) {
  // Sucursal concreta: este reporte alimenta el detalle por producto del PDF de Ventas, que
  // tiene que cuadrar con los totales de esa pantalla cuando ella misma está acotada a una
  // sola sucursal. Mismo criterio que salesReport y marginsReport.
  const wid = warehouse_id ? parseInt(warehouse_id) : null;
  if (wid && Array.isArray(allowedWarehouses) && !allowedWarehouses.includes(wid)) {
    const e = new Error("No tienes acceso a este almacén"); e.status = 403; e.isOperational = true; throw e;
  }
  if (wid) wh = (alias = '') => `AND ${alias ? `${alias}.` : ''}warehouse_id = ${wid}`;

  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS = dateClause(df, dt, 's', hours);
  // Mismo recorte por serie que salesReport: este reporte alimenta el detalle por producto
  // del PDF de ventas, y con filtros distintos las líneas no sumarían el total que lo encabeza.
  const se = buildSerieScope(serie_ids);
  const lim = parseInt(limit) || 20;

  const catId = category_id ? parseInt(category_id, 10) : null;
  const subTxt = subcategory ? String(subcategory).trim() : null;
  const repLocal = { ...rep };
  let filtroCat = "";
  if (catId && Number.isInteger(catId)) {
    repLocal.catId = catId;
    filtroCat += " AND p.category_id = :catId";
  }
  if (subTxt === "__none__") {
    filtroCat += " AND (p.subcategory IS NULL OR TRIM(p.subcategory) = '')";
  } else if (subTxt === "__any__") {
    filtroCat += " AND p.subcategory IS NOT NULL AND TRIM(p.subcategory) <> ''";
  } else if (subTxt) {
    repLocal.subTxt = subTxt.toLowerCase();
    filtroCat += " AND LOWER(TRIM(COALESCE(p.subcategory, ''))) = :subTxt";
  }

  // Mismo criterio de "venta realizada" que salesReport y marginsReport: lo que salió del
  // inventario. Las anuladas quedan fuera —si no, productos que nunca se vendieron aparecían
  // en el top, y desaparecían del listado de estancados, que es el efecto inverso—, pero lo
  // vendido a crédito entra: la mercancía se despachó igual, y dejarla afuera hacía que este
  // listado no explicara la salida de stock (ver utils/saleBalance, DISPATCHED_STATUSES).
  const stS = `AND s.status IN (${DISPATCHED_SQL}) AND s.is_prior_debt IS NOT TRUE`;

  // Valorizar existencias: cada una vale lo que costó donde está, no lo que dice el catálogo.
  // Se suma fila por fila porque el mismo producto pudo costar distinto en cada sucursal.
  const valueCost = `(SELECT COALESCE(SUM(qty * COALESCE(cost_price, p.cost_price, 0)), 0)
                        FROM product_stock WHERE product_id = p.id AND company_id = p.company_id ${wh()})`;
  const valueSale = `(SELECT COALESCE(SUM(qty * COALESCE(price, p.price)), 0)
                        FROM product_stock WHERE product_id = p.id AND company_id = p.company_id ${wh()})`;

  const [topByRevenue, topByQty, bySubcategory, slowMovers, stockValue] = await Promise.all([
    sequelize.query(
      `SELECT si.product_id,
              si.name AS product_name,
              COALESCE(p.category_id, 0) AS category_id,
              COALESCE(c.name, 'Sin categoría') AS category_name,
              COALESCE(NULLIF(TRIM(p.subcategory), ''), '') AS subcategory,
              COALESCE(p.unit, 'UNIDAD') AS unit,
              COUNT(DISTINCT si.sale_id)::int AS sale_count,
              COALESCE(SUM(si.quantity), 0)::float AS total_qty,
              COALESCE(SUM(si.subtotal), 0)::float AS total_revenue,
              COALESCE(AVG(si.price), 0)::float AS avg_price
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE TRUE ${tcS} ${wh('s')} ${se('s')} ${dS} ${stS} ${filtroCat}
       GROUP BY si.product_id, si.name, p.category_id, c.name, p.subcategory, p.unit
       ORDER BY total_revenue DESC
       LIMIT ${lim}`,
      { replacements: repLocal, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT si.product_id,
              si.name AS product_name,
              COALESCE(p.category_id, 0) AS category_id,
              COALESCE(c.name, 'Sin categoría') AS category_name,
              COALESCE(NULLIF(TRIM(p.subcategory), ''), '') AS subcategory,
              COALESCE(p.unit, 'UNIDAD') AS unit,
              COUNT(DISTINCT si.sale_id)::int AS sale_count,
              COALESCE(SUM(si.quantity), 0)::float AS total_qty,
              COALESCE(SUM(si.subtotal), 0)::float AS total_revenue,
              COALESCE(AVG(si.price), 0)::float AS avg_price
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE TRUE ${tcS} ${wh('s')} ${se('s')} ${dS} ${stS} ${filtroCat}
       GROUP BY si.product_id, si.name, p.category_id, c.name, p.subcategory, p.unit
       ORDER BY total_qty DESC
       LIMIT ${lim}`,
      { replacements: repLocal, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COALESCE(p.category_id, 0) AS category_id,
              COALESCE(c.name, 'Sin categoría') AS category_name,
              COALESCE(NULLIF(TRIM(p.subcategory), ''), '') AS subcategory,
              COUNT(DISTINCT si.product_id)::int AS product_count,
              COUNT(DISTINCT si.sale_id)::int AS sale_count,
              COALESCE(SUM(si.quantity), 0)::float AS total_qty,
              COALESCE(SUM(si.subtotal), 0)::float AS total_revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       LEFT JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE TRUE ${tcS} ${wh('s')} ${se('s')} ${dS} ${stS}
       GROUP BY p.category_id, c.name, COALESCE(NULLIF(TRIM(p.subcategory), ''), '')
       ORDER BY total_qty DESC, total_revenue DESC`,
      { replacements: repLocal, type: Sequelize.QueryTypes.SELECT }
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
      { replacements: repLocal, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         COUNT(*)::int AS product_count,
         COALESCE(SUM(${valueSale}), 0)::float AS total_value_sale,
         COALESCE(SUM(${valueCost}), 0)::float AS total_value_cost
       FROM products p
       WHERE is_combo = false AND is_service = false ${tcP}`,
      { replacements: repLocal, type: Sequelize.QueryTypes.SELECT }
    ),
  ]);

  return {
    top_by_revenue: topByRevenue,
    top_by_qty:     topByQty,
    by_subcategory: bySubcategory,
    slow_movers:    slowMovers,
    stock_value:    stockValue[0] || { product_count: 0, total_value_sale: 0, total_value_cost: 0 },
  };
}

module.exports = productsReport;
