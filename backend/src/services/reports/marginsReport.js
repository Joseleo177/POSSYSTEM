const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause, localDate, DISPATCHED_SQL } = require("./shared");

async function marginsReport({ date_from, date_to, limit, warehouse_id, company_id, tcS, rep, wh, allowedWarehouses, hours }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const dS = dateClause(df, dt, 's', hours);
  // Misma expresión de día que el filtro: con franja nocturna es la jornada, no la fecha.
  const diaS = localDate('s.created_at', hours);
  const lim = parseInt(limit) || 0;   // 0 = usar defaults de pantalla

  // Margen de una sucursal concreta. Cobra sentido ahora que el costo es por sucursal: la
  // misma mercancía puede dejar utilidades distintas en cada tienda según a cuánto la compró.
  // Sin sucursal elegida rige el recorte de siempre: lo que el usuario tiene permitido ver.
  const wid = warehouse_id ? parseInt(warehouse_id) : null;
  if (wid && Array.isArray(allowedWarehouses) && !allowedWarehouses.includes(wid)) {
    const e = new Error("No tienes acceso a este almacén"); e.status = 403; e.isOperational = true; throw e;
  }
  const whS = wid ? `AND s.warehouse_id = ${wid}` : wh('s');

  // Mismo criterio de "ingreso realizado" que salesReport. Va en una sola constante
  // porque antes solo lo aplicaba la consulta por día: el resumen y los desgloses
  // sumaban también las anuladas, así que la pantalla se contradecía a sí misma.
  // Incluye las exoneradas: el costo de esa mercancía se incurrió igual. Con el ingreso en
  // cero por el perdón, el margen que muestran es la pérdida real de haberla regalado.
  // Lo vendido a crédito también entra: su costo se incurrió al despachar la mercancía, y
  // dejarlo fuera subestimaba el costo del período contra un ingreso que sí lo incluía.
  const stS = `AND s.status IN (${DISPATCHED_SQL})`;

  // Costo unitario a usar: primero el congelado en la venta; si no lo hay —ventas anteriores
  // a que se congelara—, el de la sucursal donde se vendió, que es la mejor reconstrucción
  // posible; luego el del catálogo; y para los combos, que no guardan costo propio, la suma
  // de sus componentes en esa misma sucursal.
  //
  // El salto por la sucursal importa: sin él, el margen de una tienda se reconstruía con lo
  // que la mercancía le costó a la otra.
  const unitCost = `COALESCE(si.cost_price, (
           SELECT ps.cost_price FROM product_stock ps
            WHERE ps.product_id = si.product_id AND ps.warehouse_id = s.warehouse_id
         ), p.cost_price, (
           SELECT SUM(COALESCE((
                    SELECT ps2.cost_price FROM product_stock ps2
                     WHERE ps2.product_id = ing.id AND ps2.warehouse_id = s.warehouse_id
                  ), ing.cost_price, 0) * pci.quantity)
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
       WHERE TRUE ${tcS} ${whS} ${dS} ${stS}
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
       WHERE TRUE ${tcS} ${whS} ${dS} ${stS}
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
       WHERE ${unitCost} > 0 ${tcS} ${whS} ${dS} ${stS}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
         ${diaS} AS day,
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
       WHERE TRUE ${tcS} ${whS} ${dS} ${stS}
       GROUP BY ${diaS}
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
