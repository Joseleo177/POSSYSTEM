const { Sale, SaleItem, Product, Customer, Employee, Purchase, PurchaseItem, Warehouse, Sequelize, sequelize } = require("../models");
const { Op } = Sequelize;

// ── Helpers ──────────────────────────────────────────────────
function dateWhere(date_from, date_to) {
  if (!date_from && !date_to) return {};
  const w = {};
  if (date_from) w[Op.gte] = date_from;
  if (date_to)   w[Op.lt]  = Sequelize.literal(`('${date_to}'::date + INTERVAL '1 day')`);
  return { created_at: w };
}

// ── GET /api/reports/sales ────────────────────────────────────
const getSalesReport = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const where = dateWhere(date_from, date_to);

    const [summary, byMethod, byDay, byEmployee, byHour] = await Promise.all([

      // Resumen general — ingresos solo de ventas pagadas
      sequelize.query(
        `SELECT
           COUNT(*)::int AS total_sales,
           COALESCE(SUM(CASE WHEN status = 'pagado' THEN total ELSE 0 END), 0)::float AS total_revenue,
           COALESCE(AVG(CASE WHEN status = 'pagado' THEN total END), 0)::float AS avg_ticket,
           COALESCE(MAX(CASE WHEN status = 'pagado' THEN total END), 0)::float AS max_sale,
           COALESCE(MIN(CASE WHEN status = 'pagado' THEN total END), 0)::float AS min_sale,
           COUNT(CASE WHEN status IN ('pendiente','parcial') THEN 1 END)::int AS pending_count,
           COALESCE(SUM(CASE WHEN status IN ('pendiente','parcial') THEN total ELSE 0 END), 0)::float AS pending_amount
         FROM sales
         WHERE TRUE
           ${date_from ? `AND created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Por diario de pago (tabla payments + payment_journals)
      sequelize.query(
        `SELECT
           COALESCE(pj.name, 'Sin diario') AS method_name,
           COALESCE(pj.type, 'otro') AS method_type,
           COUNT(DISTINCT p.sale_id)::int AS count,
           COALESCE(SUM(p.amount), 0)::float AS total
         FROM payments p
         LEFT JOIN payment_journals pj ON p.payment_journal_id = pj.id
         JOIN sales s ON p.sale_id = s.id
         WHERE TRUE
           ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY pj.id, pj.name, pj.type
         ORDER BY total DESC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Por día (solo ventas pagadas)
      sequelize.query(
        `SELECT DATE(created_at) AS day,
                COUNT(*)::int    AS count,
                COALESCE(SUM(total), 0)::float AS revenue
         FROM sales
         WHERE status = 'pagado'
           ${date_from ? `AND created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY DATE(created_at)
         ORDER BY day ASC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Por empleado (solo ventas pagadas)
      sequelize.query(
        `SELECT e.full_name AS employee_name,
                COUNT(s.id)::int AS count,
                COALESCE(SUM(s.total), 0)::float AS revenue,
                COALESCE(AVG(s.total), 0)::float AS avg_ticket
         FROM sales s
         LEFT JOIN employees e ON s.employee_id = e.id
         WHERE s.status = 'pagado'
           ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY e.id, e.full_name
         ORDER BY revenue DESC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Por hora del día (solo ventas pagadas)
      sequelize.query(
        `SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
                COUNT(*)::int AS count,
                COALESCE(SUM(total), 0)::float AS revenue
         FROM sales
         WHERE status = 'pagado'
           ${date_from ? `AND created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY EXTRACT(HOUR FROM created_at)
         ORDER BY hour ASC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),
    ]);

    const s = summary[0] || {};
    res.json({
      ok: true,
      data: {
        summary: {
          total_sales:    parseInt(s.total_sales    || 0),
          total_revenue:  parseFloat(s.total_revenue  || 0),
          avg_ticket:     parseFloat(s.avg_ticket     || 0),
          max_sale:       parseFloat(s.max_sale       || 0),
          min_sale:       parseFloat(s.min_sale       || 0),
          pending_count:  parseInt(s.pending_count  || 0),
          pending_amount: parseFloat(s.pending_amount || 0),
        },
        by_method:   byMethod,
        by_day:      byDay,
        by_employee: byEmployee,
        by_hour:     byHour,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al generar reporte de ventas" });
  }
};

// ── GET /api/reports/products ─────────────────────────────────
const getProductsReport = async (req, res) => {
  try {
    const { date_from, date_to, limit = 20 } = req.query;

    const [topByRevenue, topByQty, slowMovers, stockValue] = await Promise.all([

      // Top productos por ingresos
      sequelize.query(
        `SELECT si.product_id,
                si.name                           AS product_name,
                COALESCE(p.category_id, 0)        AS category_id,
                COUNT(DISTINCT si.sale_id)::int   AS sale_count,
                COALESCE(SUM(si.quantity), 0)::float  AS total_qty,
                COALESCE(SUM(si.subtotal), 0)::float  AS total_revenue,
                COALESCE(AVG(si.unit_price), 0)::float AS avg_price
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id
         LEFT JOIN products p ON si.product_id = p.id
         WHERE TRUE
           ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY si.product_id, si.name, p.category_id
         ORDER BY total_revenue DESC
         LIMIT ${parseInt(limit)}`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Top por cantidad vendida
      sequelize.query(
        `SELECT si.product_id,
                si.name AS product_name,
                COALESCE(SUM(si.quantity), 0)::float AS total_qty,
                COALESCE(SUM(si.subtotal), 0)::float AS total_revenue
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id
         WHERE TRUE
           ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY si.product_id, si.name
         ORDER BY total_qty DESC
         LIMIT ${parseInt(limit)}`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Productos sin movimiento (tienen stock pero no aparecen en ventas del período)
      sequelize.query(
        `SELECT p.id, p.name, p.stock, p.price, p.min_stock,
                p.cost_price
         FROM products p
         WHERE p.is_service = false
           AND p.is_combo = false
           AND p.stock > 0
           AND p.id NOT IN (
             SELECT DISTINCT si.product_id
             FROM sale_items si
             JOIN sales s ON si.sale_id = s.id
             WHERE TRUE
               ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
               ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
           )
         ORDER BY p.stock DESC
         LIMIT 20`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Valor total del inventario
      sequelize.query(
        `SELECT
           COUNT(*)::int AS product_count,
           COALESCE(SUM(stock * price), 0)::float AS total_value_sale,
           COALESCE(SUM(stock * COALESCE(cost_price, 0)), 0)::float AS total_value_cost
         FROM products
         WHERE is_combo = false AND is_service = false`,
        { type: Sequelize.QueryTypes.SELECT }
      ),
    ]);

    res.json({
      ok: true,
      data: {
        top_by_revenue: topByRevenue,
        top_by_qty:     topByQty,
        slow_movers:    slowMovers,
        stock_value:    stockValue[0] || { product_count: 0, total_value_sale: 0, total_value_cost: 0 },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al generar reporte de productos" });
  }
};

// ── GET /api/reports/receivables ─────────────────────────────
const getReceivablesReport = async (req, res) => {
  try {
    const [summary, byCustomer, aging] = await Promise.all([

      // Resumen
      sequelize.query(
        `SELECT
           COUNT(*)::int AS total_invoices,
           COALESCE(SUM(total - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id)), 0)::float AS total_balance,
           COALESCE(SUM(total), 0)::float AS total_billed,
           COALESCE(SUM((SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id)), 0)::float AS total_collected
         FROM sales s
         WHERE status IN ('pendiente', 'parcial')`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Por cliente
      sequelize.query(
        `SELECT
           c.id AS customer_id,
           COALESCE(c.name, 'Sin cliente') AS customer_name,
           c.phone,
           c.rif,
           COUNT(s.id)::int AS invoice_count,
           COALESCE(SUM(s.total), 0)::float AS total_billed,
           COALESCE(SUM(s.total - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id)), 0)::float AS balance,
           MIN(s.created_at) AS oldest_invoice,
           MAX(s.created_at) AS latest_invoice
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.id
         WHERE s.status IN ('pendiente', 'parcial')
         GROUP BY c.id, c.name, c.phone, c.rif
         ORDER BY balance DESC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Aging (antigüedad de deuda)
      sequelize.query(
        `SELECT
           COUNT(CASE WHEN NOW() - created_at <= INTERVAL '30 days'  THEN 1 END)::int                                 AS d0_30_count,
           COALESCE(SUM(CASE WHEN NOW() - created_at <= INTERVAL '30 days'  THEN total - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id) ELSE 0 END), 0)::float AS d0_30_amount,
           COUNT(CASE WHEN NOW() - created_at BETWEEN INTERVAL '31 days' AND INTERVAL '60 days' THEN 1 END)::int      AS d31_60_count,
           COALESCE(SUM(CASE WHEN NOW() - created_at BETWEEN INTERVAL '31 days' AND INTERVAL '60 days' THEN total - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id) ELSE 0 END), 0)::float AS d31_60_amount,
           COUNT(CASE WHEN NOW() - created_at > INTERVAL '60 days' THEN 1 END)::int                                   AS d60_plus_count,
           COALESCE(SUM(CASE WHEN NOW() - created_at > INTERVAL '60 days'  THEN total - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = s.id) ELSE 0 END), 0)::float AS d60_plus_amount
         FROM sales s
         WHERE status IN ('pendiente', 'parcial')`,
        { type: Sequelize.QueryTypes.SELECT }
      ),
    ]);

    res.json({
      ok: true,
      data: {
        summary:     summary[0] || {},
        by_customer: byCustomer,
        aging:       aging[0]   || {},
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al generar reporte de cuentas por cobrar" });
  }
};

// ── GET /api/reports/purchases ────────────────────────────────
const getPurchasesReport = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    const [summary, bySupplier, byDay, topProducts] = await Promise.all([

      // Resumen
      sequelize.query(
        `SELECT
           COUNT(*)::int AS total_orders,
           COALESCE(SUM(total), 0)::float AS total_cost,
           COALESCE(AVG(total), 0)::float AS avg_order,
           COALESCE(MAX(total), 0)::float AS max_order
         FROM purchases
         WHERE TRUE
           ${date_from ? `AND created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Por proveedor
      sequelize.query(
        `SELECT
           COALESCE(c.name, p.supplier_name, 'Sin proveedor') AS supplier_name,
           COUNT(p.id)::int AS order_count,
           COALESCE(SUM(p.total), 0)::float AS total_cost
         FROM purchases p
         LEFT JOIN customers c ON p.supplier_id = c.id
         WHERE TRUE
           ${date_from ? `AND p.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND p.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY c.name, p.supplier_name
         ORDER BY total_cost DESC
         LIMIT 20`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Por día
      sequelize.query(
        `SELECT DATE(created_at) AS day,
                COUNT(*)::int AS count,
                COALESCE(SUM(total), 0)::float AS cost
         FROM purchases
         WHERE TRUE
           ${date_from ? `AND created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY DATE(created_at)
         ORDER BY day ASC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Productos más comprados
      sequelize.query(
        `SELECT
           pi.product_id,
           pi.product_name,
           COUNT(DISTINCT pi.purchase_id)::int AS order_count,
           COALESCE(SUM(pi.package_qty * pi.package_size), 0)::float AS total_units,
           COALESCE(SUM(pi.package_qty * pi.package_price), 0)::float AS total_cost
         FROM purchase_items pi
         JOIN purchases p ON pi.purchase_id = p.id
         WHERE TRUE
           ${date_from ? `AND p.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND p.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY pi.product_id, pi.product_name
         ORDER BY total_cost DESC
         LIMIT 15`,
        { type: Sequelize.QueryTypes.SELECT }
      ),
    ]);

    res.json({
      ok: true,
      data: {
        summary:      summary[0] || {},
        by_supplier:  bySupplier,
        by_day:       byDay,
        top_products: topProducts,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al generar reporte de compras" });
  }
};

// ── GET /api/reports/inventory ────────────────────────────────
const getInventoryReport = async (req, res) => {
  try {
    const { days = 30 } = req.query; // rotation window

    const [criticalStock, zeroStock, rotation, byCategory, topRotation, lowRotation] = await Promise.all([

      // Productos bajo mínimo (con stock mínimo definido)
      sequelize.query(
        `SELECT p.id, p.name, p.stock, p.min_stock, p.unit, p.price,
                COALESCE(c.name,'Sin categoría') AS category_name,
                (p.min_stock - p.stock) AS needed
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.is_service = false
           AND p.is_combo = false
           AND p.min_stock > 0
           AND p.stock < p.min_stock
         ORDER BY (p.min_stock - p.stock) DESC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Productos sin stock
      sequelize.query(
        `SELECT p.id, p.name, p.stock, p.min_stock, p.unit,
                COALESCE(c.name,'Sin categoría') AS category_name
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.is_service = false
           AND p.is_combo = false
           AND (p.stock IS NULL OR p.stock <= 0)
         ORDER BY p.name ASC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Rotación: unidades vendidas en los últimos N días
      sequelize.query(
        `SELECT
           p.id, p.name, p.stock, p.unit,
           COALESCE(c.name,'Sin categoría') AS category_name,
           COALESCE(SUM(si.quantity), 0)::float AS units_sold,
           CASE WHEN p.stock > 0
                THEN ROUND((COALESCE(SUM(si.quantity), 0) / p.stock)::numeric, 2)
                ELSE NULL
           END AS rotation_ratio
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN sale_items si ON si.product_id = p.id
           AND si.sale_id IN (
             SELECT id FROM sales WHERE created_at >= NOW() - (${parseInt(days)} * INTERVAL '1 day')
           )
         WHERE p.is_service = false AND p.is_combo = false
         GROUP BY p.id, p.name, p.stock, p.unit, c.name
         ORDER BY units_sold DESC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Valor del inventario por categoría
      sequelize.query(
        `SELECT
           COALESCE(c.name,'Sin categoría') AS category_name,
           COUNT(p.id)::int AS product_count,
           COALESCE(SUM(p.stock), 0)::float AS total_units,
           COALESCE(SUM(p.stock * COALESCE(p.cost_price, 0)), 0)::float AS value_cost,
           COALESCE(SUM(p.stock * p.price), 0)::float AS value_sale
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.is_service = false AND p.is_combo = false
         GROUP BY c.name
         ORDER BY value_cost DESC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Alta rotación (top 10 por units_sold)
      sequelize.query(
        `SELECT p.id, p.name, p.stock, p.unit,
                COALESCE(SUM(si.quantity), 0)::float AS units_sold,
                COALESCE(SUM(si.subtotal), 0)::float AS revenue
         FROM products p
         JOIN sale_items si ON si.product_id = p.id
         JOIN sales s ON si.sale_id = s.id
         WHERE s.created_at >= NOW() - (${parseInt(days)} * INTERVAL '1 day')
           AND p.is_service = false AND p.is_combo = false
         GROUP BY p.id, p.name, p.stock, p.unit
         ORDER BY units_sold DESC
         LIMIT 10`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Sin movimiento (con stock, sin ventas en el período)
      sequelize.query(
        `SELECT p.id, p.name, p.stock, p.price,
                COALESCE(p.cost_price, 0) AS cost_price,
                COALESCE(c.name,'Sin categoría') AS category_name,
                p.stock * COALESCE(p.cost_price, p.price) AS value_locked
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.is_service = false AND p.is_combo = false
           AND p.stock > 0
           AND p.id NOT IN (
             SELECT DISTINCT si.product_id
             FROM sale_items si
             JOIN sales s ON si.sale_id = s.id
             WHERE s.created_at >= NOW() - (${parseInt(days)} * INTERVAL '1 day')
           )
         ORDER BY value_locked DESC
         LIMIT 20`,
        { type: Sequelize.QueryTypes.SELECT }
      ),
    ]);

    res.json({
      ok: true,
      data: {
        days: parseInt(days),
        critical_stock: criticalStock,
        zero_stock:     zeroStock,
        rotation,
        by_category:    byCategory,
        top_rotation:   topRotation,
        low_rotation:   lowRotation,
        summary: {
          critical_count: criticalStock.length,
          zero_count:     zeroStock.length,
          low_rotation_count: lowRotation.length,
          total_locked_value: lowRotation.reduce((s, p) => s + parseFloat(p.value_locked || 0), 0),
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al generar reporte de inventario" });
  }
};

// ── GET /api/reports/margins ──────────────────────────────────
const getMarginsReport = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    const [byProduct, byCategory, summary] = await Promise.all([

      // Margen por producto (usa cost_price del producto actual — aproximado)
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
         WHERE TRUE
           ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
           AND p.cost_price IS NOT NULL AND p.cost_price > 0
         GROUP BY si.product_id, si.name, c.name
         ORDER BY gross_margin DESC
         LIMIT 30`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Margen por categoría
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
         WHERE TRUE
           ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY c.name
         ORDER BY gross_margin DESC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Resumen general de márgenes
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
         WHERE p.cost_price IS NOT NULL AND p.cost_price > 0
           ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}`,
        { type: Sequelize.QueryTypes.SELECT }
      ),
    ]);

    // Bottom 10 por margen (baja ganancia)
    const bottomMargin = [...byProduct].sort((a, b) => parseFloat(a.margin_pct) - parseFloat(b.margin_pct)).slice(0, 10);

    res.json({
      ok: true,
      data: {
        summary:       summary[0] || {},
        by_product:    byProduct,
        bottom_margin: bottomMargin,
        by_category:   byCategory,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al generar reporte de márgenes" });
  }
};

// ── GET /api/reports/customers-analysis ──────────────────────
const getCustomersAnalysis = async (req, res) => {
  try {
    const { date_from, date_to, inactive_days = 45 } = req.query;

    const [topCustomers, inactiveCustomers, newCustomers, ticketStats, repeatRate] = await Promise.all([

      // Top clientes por gasto en el período
      sequelize.query(
        `SELECT
           c.id, c.name, c.phone, c.rif,
           COUNT(DISTINCT s.id)::int AS purchase_count,
           COALESCE(SUM(s.total), 0)::float AS total_spent,
           COALESCE(AVG(s.total), 0)::float AS avg_ticket,
           MAX(s.created_at) AS last_purchase
         FROM customers c
         JOIN sales s ON s.customer_id = c.id
         WHERE c.type = 'cliente'
           ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY c.id, c.name, c.phone, c.rif
         ORDER BY total_spent DESC
         LIMIT 20`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Clientes inactivos: compraron antes pero NO en los últimos N días
      sequelize.query(
        `SELECT
           c.id, c.name, c.phone, c.rif,
           COUNT(s.id)::int AS total_purchases,
           COALESCE(SUM(s.total), 0)::float AS lifetime_value,
           MAX(s.created_at) AS last_purchase,
           EXTRACT(DAY FROM NOW() - MAX(s.created_at))::int AS days_inactive
         FROM customers c
         JOIN sales s ON s.customer_id = c.id
         WHERE c.type = 'cliente'
         GROUP BY c.id, c.name, c.phone, c.rif
         HAVING MAX(s.created_at) < NOW() - (${parseInt(inactive_days)} * INTERVAL '1 day')
         ORDER BY days_inactive DESC
         LIMIT 30`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Clientes nuevos en el período (primera compra dentro del período)
      sequelize.query(
        `SELECT
           c.id, c.name, c.phone,
           MIN(s.created_at) AS first_purchase,
           COUNT(s.id)::int AS purchase_count,
           COALESCE(SUM(s.total), 0)::float AS total_spent
         FROM customers c
         JOIN sales s ON s.customer_id = c.id
         WHERE c.type = 'cliente'
           ${date_from ? `AND c.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND c.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY c.id, c.name, c.phone
         ORDER BY first_purchase DESC
         LIMIT 20`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Distribución de ticket promedio
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
         WHERE TRUE
           ${date_from ? `AND created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY range
         ORDER BY MIN(total)`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Tasa de clientes recurrentes vs únicos
      sequelize.query(
        `SELECT
           COUNT(DISTINCT s.customer_id) FILTER (WHERE s.customer_id IS NOT NULL)::int AS identified_customers,
           COUNT(DISTINCT s.customer_id) FILTER (WHERE purchase_count > 1)::int AS repeat_customers
         FROM sales s
         JOIN (
           SELECT customer_id, COUNT(*) AS purchase_count
           FROM sales
           WHERE customer_id IS NOT NULL
             ${date_from ? `AND created_at >= '${date_from}'` : ""}
             ${date_to   ? `AND created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
           GROUP BY customer_id
         ) sub ON s.customer_id = sub.customer_id
         WHERE TRUE
           ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}`,
        { type: Sequelize.QueryTypes.SELECT }
      ),
    ]);

    res.json({
      ok: true,
      data: {
        top_customers:    topCustomers,
        inactive_customers: inactiveCustomers,
        new_customers:    newCustomers,
        ticket_distribution: ticketStats,
        repeat_rate:      repeatRate[0] || {},
        inactive_days:    parseInt(inactive_days),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al generar análisis de clientes" });
  }
};

// ── GET /api/reports/audit ────────────────────────────────────
const getAuditReport = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    const [returnsSummary, returnsList, byEmployee, discounts] = await Promise.all([

      // Resumen de devoluciones
      sequelize.query(
        `SELECT
           COUNT(r.id)::int AS return_count,
           COALESCE(SUM(r.total), 0)::float AS total_returned,
           COALESCE(AVG(r.total), 0)::float AS avg_return
         FROM returns r
         WHERE TRUE
           ${date_from ? `AND r.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND r.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Lista de devoluciones
      sequelize.query(
        `SELECT
           r.id,
           r.sale_id,
           r.reason,
           r.total,
           r.created_at,
           e.full_name AS employee_name,
           c.name AS customer_name
         FROM returns r
         LEFT JOIN employees e ON r.employee_id = e.id
         LEFT JOIN sales s ON r.sale_id = s.id
         LEFT JOIN customers c ON s.customer_id = c.id
         WHERE TRUE
           ${date_from ? `AND r.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND r.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         ORDER BY r.created_at DESC
         LIMIT 50`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Rendimiento detallado por empleado
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
         WHERE TRUE
           ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         GROUP BY e.id, e.full_name
         ORDER BY revenue DESC`,
        { type: Sequelize.QueryTypes.SELECT }
      ),

      // Ventas con descuento (señal de alerta)
      sequelize.query(
        `SELECT
           s.id,
           s.total,
           s.discount_amount,
           s.created_at,
           COALESCE(e.full_name, '—') AS employee_name,
           COALESCE(c.name, 'Sin cliente') AS customer_name,
           ROUND((s.discount_amount / NULLIF(s.total + s.discount_amount, 0) * 100)::numeric, 1) AS discount_pct
         FROM sales s
         LEFT JOIN employees e ON s.employee_id = e.id
         LEFT JOIN customers c ON s.customer_id = c.id
         WHERE s.discount_amount > 0
           ${date_from ? `AND s.created_at >= '${date_from}'` : ""}
           ${date_to   ? `AND s.created_at <  ('${date_to}'::date + INTERVAL '1 day')` : ""}
         ORDER BY discount_pct DESC
         LIMIT 30`,
        { type: Sequelize.QueryTypes.SELECT }
      ),
    ]);

    res.json({
      ok: true,
      data: {
        returns_summary: returnsSummary[0] || {},
        returns_list:    returnsList,
        by_employee:     byEmployee,
        discounts:       discounts,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al generar reporte de auditoría" });
  }
};

module.exports = {
  getSalesReport,
  getProductsReport,
  getReceivablesReport,
  getPurchasesReport,
  getInventoryReport,
  getMarginsReport,
  getCustomersAnalysis,
  getAuditReport,
};
