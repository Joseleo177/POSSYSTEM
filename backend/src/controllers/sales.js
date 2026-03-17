const pool = require("../db/pool");

const PAYMENT_METHODS = ["efectivo", "transferencia", "pago_movil", "zelle", "punto_venta"];

// GET /api/sales  — con filtros opcionales
const getAll = async (req, res) => {
  try {
    const { limit = 50, offset = 0, date_from, date_to, payment_method } = req.query;
    let where = "WHERE 1=1";
    const params = [];

    if (date_from) { params.push(date_from); where += ` AND s.created_at >= $${params.length}::date`; }
    if (date_to)   { params.push(date_to);   where += ` AND s.created_at <  ($${params.length}::date + INTERVAL '1 day')`; }
    if (payment_method && PAYMENT_METHODS.includes(payment_method)) {
      params.push(payment_method); where += ` AND s.payment_method = $${params.length}`;
    }

    params.push(limit);  const limitIdx  = params.length;
    params.push(offset); const offsetIdx = params.length;

    const { rows: sales } = await pool.query(
      `SELECT s.*,
              c.name        AS customer_name,
              e.full_name   AS employee_name,
              cur.symbol    AS currency_symbol,
              cur.code      AS currency_code,
              pj.name       AS journal_name,
              pj.color      AS journal_color,
              w.name        AS warehouse_name,
              json_agg(json_build_object(
                'id',         si.id,
                'product_id', si.product_id,
                'name',       si.name,
                'price',      si.price,
                'quantity',   si.quantity,
                'discount',   si.discount,
                'subtotal',   si.subtotal
              ) ORDER BY si.id) AS items
       FROM sales s
       LEFT JOIN customers        c   ON c.id   = s.customer_id
       LEFT JOIN employees        e   ON e.id   = s.employee_id
       LEFT JOIN currencies       cur ON cur.id = s.currency_id
       LEFT JOIN payment_journals pj  ON pj.id  = s.payment_journal_id
       LEFT JOIN warehouses       w   ON w.id   = s.warehouse_id
       JOIN  sale_items si ON si.sale_id = s.id
       ${where}
       GROUP BY s.id, c.name, e.full_name, cur.symbol, cur.code, pj.name, pj.color, w.name
       ORDER BY s.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(DISTINCT s.id) FROM sales s ${where}`, countParams
    );

    res.json({ ok: true, data: sales, total: parseInt(count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener ventas" });
  }
};

// GET /api/sales/stats
const getStats = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let where = "WHERE 1=1";
    const params = [];
    if (date_from) { params.push(date_from); where += ` AND created_at >= $${params.length}::date`; }
    if (date_to)   { params.push(date_to);   where += ` AND created_at <  ($${params.length}::date + INTERVAL '1 day')`; }

    const { rows: [summary] } = await pool.query(`
      SELECT
        COUNT(*)                        AS total_sales,
        COALESCE(SUM(total), 0)         AS total_revenue,
        COALESCE(AVG(total), 0)         AS avg_sale,
        COALESCE(MAX(total), 0)         AS max_sale,
        COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END)  AS sales_today,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN total ELSE 0 END), 0) AS revenue_today
      FROM sales ${where}
    `, params);

    const { rows: byMethod } = await pool.query(`
      SELECT payment_method,
             COUNT(*)                AS count,
             COALESCE(SUM(total), 0) AS total
      FROM sales ${where}
      GROUP BY payment_method
      ORDER BY total DESC
    `, params);

    res.json({ ok: true, data: { ...summary, by_method: byMethod } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener estadísticas" });
  }
};

// POST /api/sales
const create = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      items, paid, customer_id, employee_id, currency_id,
      exchange_rate, payment_method, payment_journal_id,
      discount_amount, warehouse_id,
    } = req.body;

    if (!items?.length)    return res.status(400).json({ ok: false, message: "items es requerido" });
    if (paid == null)      return res.status(400).json({ ok: false, message: "paid es requerido" });
    if (!warehouse_id)     return res.status(400).json({ ok: false, message: "warehouse_id es requerido" });

    // Resolver método de pago desde el diario si se envía
    let method = PAYMENT_METHODS.includes(payment_method) ? payment_method : "efectivo";
    if (payment_journal_id) {
      const { rows: jRows } = await pool.query(
        "SELECT type FROM payment_journals WHERE id=$1", [payment_journal_id]
      );
      if (jRows.length) method = jRows[0].type;
    }

    const discAmt   = parseFloat(discount_amount) || 0;
    const rate      = parseFloat(exchange_rate)   || 1;
    const journalId = payment_journal_id ? parseInt(payment_journal_id) : null;

    await client.query("BEGIN");

    let total = 0;
    const enriched = [];

    for (const item of items) {
      // Leer precio y nombre del producto
      const { rows: prodRows } = await client.query(
        "SELECT id, name, price FROM products WHERE id = $1 FOR UPDATE",
        [item.product_id]
      );
      if (!prodRows.length) throw new Error(`Producto ${item.product_id} no encontrado`);
      const product = prodRows[0];

      // ── Verificar stock en el almacén específico ──────────────
      const { rows: stockRows } = await client.query(
        "SELECT qty FROM product_stock WHERE warehouse_id = $1 AND product_id = $2 FOR UPDATE",
        [warehouse_id, item.product_id]
      );
      const availableQty = parseFloat(stockRows[0]?.qty || 0);
      if (availableQty < item.quantity)
        throw new Error(`Stock insuficiente para "${product.name}" en este almacén. Disponible: ${availableQty}`);

      total += parseFloat(product.price) * item.quantity;
      enriched.push({ ...product, quantity: item.quantity });
    }

    total = parseFloat((total - discAmt).toFixed(2));
    if (total < 0) total = 0;

    const paidBase = parseFloat(paid) / rate;
    if (paidBase < total - 0.01) throw new Error("Pago insuficiente");
    const change = parseFloat((paidBase - total).toFixed(2));

    // Insertar venta con warehouse_id
    const { rows: [sale] } = await client.query(
      `INSERT INTO sales
         (total, paid, change, customer_id, employee_id, currency_id, exchange_rate,
          discount_amount, payment_method, payment_journal_id, warehouse_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [total, paidBase, change, customer_id||null, employee_id||null, currency_id||null,
       rate, discAmt, method, journalId, warehouse_id]
    );

    for (const p of enriched) {
      // Insertar línea de venta
      await client.query(
        "INSERT INTO sale_items (sale_id, product_id, name, price, quantity) VALUES ($1,$2,$3,$4,$5)",
        [sale.id, p.id, p.name, p.price, p.quantity]
      );

      // ── Descontar de product_stock (almacén específico) ───────
      await client.query(
        "UPDATE product_stock SET qty = qty - $1 WHERE warehouse_id = $2 AND product_id = $3",
        [p.quantity, warehouse_id, p.id]
      );

      // ── Sincronizar products.stock con suma total de almacenes ─
      await client.query(
        `UPDATE products
         SET stock = (SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = $1)
         WHERE id = $1`,
        [p.id]
      );
    }

    await client.query("COMMIT");

    // Retornar venta completa
    const { rows: [fullSale] } = await pool.query(
      `SELECT s.*,
              c.name       AS customer_name,
              e.full_name  AS employee_name,
              cur.symbol   AS currency_symbol,
              cur.code     AS currency_code,
              pj.name      AS journal_name,
              pj.color     AS journal_color,
              w.name       AS warehouse_name,
              json_agg(json_build_object(
                'product_id', si.product_id,
                'name',       si.name,
                'price',      si.price,
                'quantity',   si.quantity,
                'subtotal',   si.subtotal
              )) AS items
       FROM sales s
       LEFT JOIN customers        c   ON c.id   = s.customer_id
       LEFT JOIN employees        e   ON e.id   = s.employee_id
       LEFT JOIN currencies       cur ON cur.id = s.currency_id
       LEFT JOIN payment_journals pj  ON pj.id  = s.payment_journal_id
       LEFT JOIN warehouses       w   ON w.id   = s.warehouse_id
       JOIN  sale_items si ON si.sale_id = s.id
       WHERE s.id = $1
       GROUP BY s.id, c.name, e.full_name, cur.symbol, cur.code, pj.name, pj.color, w.name`,
      [sale.id]
    );

    res.status(201).json({ ok: true, data: fullSale });
  } catch (err) {
    await client.query("ROLLBACK");
    const status = /insuficiente|no encontrado/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  } finally {
    client.release();
  }
};

// DELETE /api/sales/:id — anular venta y restaurar stock en el almacén original
const cancel = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [sale] } = await client.query(
      "SELECT id, warehouse_id FROM sales WHERE id = $1", [req.params.id]
    );
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Venta no encontrada" });
    }

    const { rows: items } = await client.query(
      "SELECT product_id, quantity FROM sale_items WHERE sale_id = $1", [req.params.id]
    );

    for (const item of items) {
      if (!item.product_id) continue;

      if (sale.warehouse_id) {
        // ── Restaurar en el almacén original ──────────────────
        await client.query(
          `INSERT INTO product_stock (warehouse_id, product_id, qty)
           VALUES ($1, $2, $3)
           ON CONFLICT (warehouse_id, product_id)
           DO UPDATE SET qty = product_stock.qty + EXCLUDED.qty`,
          [sale.warehouse_id, item.product_id, item.quantity]
        );
      }

      // ── Sincronizar products.stock ─────────────────────────
      await client.query(
        `UPDATE products
         SET stock = (SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = $1)
         WHERE id = $1`,
        [item.product_id]
      );
    }

    await client.query("DELETE FROM sales WHERE id = $1", [req.params.id]);
    await client.query("COMMIT");
    res.json({ ok: true, message: "Venta anulada y stock restaurado" });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: err.message });
  } finally {
    client.release();
  }
};

module.exports = { getAll, getStats, create, cancel };