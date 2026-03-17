const pool = require("../db/pool");

// GET /api/purchases
const getAll = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*,
             e.full_name  AS employee_name,
             c.name       AS supplier_customer_name,
             c.rif        AS supplier_rif,
             w.name       AS warehouse_name,
             COUNT(pi.id)::int AS item_count
      FROM purchases p
      LEFT JOIN employees      e   ON p.employee_id  = e.id
      LEFT JOIN customers      c   ON p.supplier_id  = c.id
      LEFT JOIN warehouses     w   ON p.warehouse_id = w.id
      LEFT JOIN purchase_items pi  ON pi.purchase_id = p.id
      GROUP BY p.id, e.full_name, c.name, c.rif, w.name
      ORDER BY p.created_at DESC
      LIMIT 200
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener compras" });
  }
};

// GET /api/purchases/:id
const getOne = async (req, res) => {
  try {
    const { rows: [purchase] } = await pool.query(`
      SELECT p.*, e.full_name AS employee_name, w.name AS warehouse_name
      FROM purchases p
      LEFT JOIN employees  e ON p.employee_id  = e.id
      LEFT JOIN warehouses w ON p.warehouse_id = w.id
      WHERE p.id = $1
    `, [req.params.id]);

    if (!purchase) return res.status(404).json({ ok: false, message: "Compra no encontrada" });

    const { rows: items } = await pool.query(`
      SELECT pi.*, pr.image_filename
      FROM purchase_items pi
      LEFT JOIN products pr ON pr.id = pi.product_id
      WHERE pi.purchase_id = $1
      ORDER BY pi.id
    `, [req.params.id]);

    res.json({ ok: true, data: { ...purchase, items } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener compra" });
  }
};

// POST /api/purchases
const create = async (req, res) => {
  const client = await pool.connect();
  try {
    const { supplier_id, supplier_name, notes, items, warehouse_id } = req.body;

    if (!items || !items.length)
      return res.status(400).json({ ok: false, message: "Debe incluir al menos un producto" });
    if (!warehouse_id)
      return res.status(400).json({ ok: false, message: "warehouse_id es requerido" });

    // Verificar que el almacén existe y está activo
    const { rows: [warehouse] } = await pool.query(
      "SELECT id, name FROM warehouses WHERE id = $1 AND active = TRUE",
      [warehouse_id]
    );
    if (!warehouse)
      return res.status(400).json({ ok: false, message: "Almacén no encontrado o inactivo" });

    await client.query("BEGIN");

    // Resolver proveedor
    let resolvedSupplierName = supplier_name || null;
    let resolvedSupplierId   = supplier_id ? parseInt(supplier_id) : null;
    if (resolvedSupplierId) {
      const { rows: [sup] } = await client.query(
        "SELECT name, tax_name FROM customers WHERE id=$1 AND type='proveedor'",
        [resolvedSupplierId]
      );
      if (sup) resolvedSupplierName = sup.tax_name || sup.name;
    }

    // Insertar cabecera de compra
    const { rows: [purchase] } = await client.query(
      `INSERT INTO purchases (supplier_id, supplier_name, notes, total, employee_id, warehouse_id)
       VALUES ($1, $2, $3, 0, $4, $5) RETURNING *`,
      [resolvedSupplierId, resolvedSupplierName, notes || null,
       req.employee?.id || null, warehouse_id]
    );

    let grandTotal = 0;

    for (const item of items) {
      const {
        product_id,
        package_unit,
        package_size,
        package_qty,
        package_price,
        profit_margin,
        update_price = true,
      } = item;

      if (!product_id || !package_size || !package_qty || !package_price)
        throw new Error("Datos incompletos en línea de compra");

      const pkgSize  = parseFloat(package_size);
      const pkgQty   = parseFloat(package_qty);
      const pkgPrice = parseFloat(package_price);
      const margin   = parseFloat(profit_margin) || 0;

      const unit_cost   = pkgPrice / pkgSize;
      const sale_price  = unit_cost * (1 + margin / 100);
      const total_units = pkgQty * pkgSize;
      const subtotal    = pkgQty * pkgPrice;

      grandTotal += subtotal;

      // Nombre del producto
      const { rows: [prod] } = await client.query(
        "SELECT name FROM products WHERE id=$1 FOR UPDATE",
        [product_id]
      );
      if (!prod) throw new Error(`Producto ID ${product_id} no encontrado`);

      await client.query(
        `INSERT INTO purchase_items
           (purchase_id, product_id, product_name, package_unit, package_qty, package_size,
            package_price, unit_cost, profit_margin, sale_price, total_units, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [purchase.id, product_id, prod.name,
         package_unit || "unidad", pkgQty, pkgSize,
         pkgPrice, unit_cost, margin, sale_price, total_units, subtotal]
      );

      // ── Sumar stock en el almacén seleccionado (upsert) ───────
      await client.query(
        `INSERT INTO product_stock (warehouse_id, product_id, qty)
         VALUES ($1, $2, $3)
         ON CONFLICT (warehouse_id, product_id)
         DO UPDATE SET qty = product_stock.qty + EXCLUDED.qty`,
        [warehouse_id, product_id, total_units]
      );

      // ── Actualizar precio / costo / margen en products ────────
      if (update_price) {
        await client.query(
          `UPDATE products
           SET cost_price = $1, profit_margin = $2,
               package_size = $3, package_unit = $4, price = $5
           WHERE id = $6`,
          [unit_cost, margin, pkgSize, package_unit || "unidad", sale_price, product_id]
        );
      } else {
        await client.query(
          `UPDATE products
           SET cost_price = $1, profit_margin = $2,
               package_size = $3, package_unit = $4
           WHERE id = $5`,
          [unit_cost, margin, pkgSize, package_unit || "unidad", product_id]
        );
      }

      // ── Sincronizar products.stock con suma total de almacenes ─
      await client.query(
        `UPDATE products
         SET stock = (SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = $1)
         WHERE id = $1`,
        [product_id]
      );
    }

    // Actualizar total de la compra
    await client.query(
      "UPDATE purchases SET total=$1 WHERE id=$2",
      [grandTotal, purchase.id]
    );

    await client.query("COMMIT");

    // Retornar compra completa
    const { rows: [fullPurchase] } = await pool.query(`
      SELECT p.*, e.full_name AS employee_name, w.name AS warehouse_name
      FROM purchases p
      LEFT JOIN employees  e ON p.employee_id  = e.id
      LEFT JOIN warehouses w ON p.warehouse_id = w.id
      WHERE p.id = $1
    `, [purchase.id]);

    const { rows: fullItems } = await pool.query(
      "SELECT * FROM purchase_items WHERE purchase_id=$1 ORDER BY id",
      [purchase.id]
    );

    res.status(201).json({ ok: true, data: { ...fullPurchase, items: fullItems } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "Error al crear compra" });
  } finally {
    client.release();
  }
};

// DELETE /api/purchases/:id — anula la compra y revierte el stock del almacén original
const remove = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [purchase] } = await client.query(
      "SELECT id, warehouse_id FROM purchases WHERE id=$1",
      [req.params.id]
    );
    if (!purchase) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Compra no encontrada" });
    }

    const { rows: items } = await client.query(
      "SELECT * FROM purchase_items WHERE purchase_id=$1",
      [req.params.id]
    );

    for (const item of items) {
      if (!item.product_id) continue;

      if (purchase.warehouse_id) {
        // ── Revertir stock en el almacén original ─────────────
        await client.query(
          `UPDATE product_stock
           SET qty = GREATEST(0, qty - $1)
           WHERE warehouse_id = $2 AND product_id = $3`,
          [item.total_units, purchase.warehouse_id, item.product_id]
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

    await client.query("DELETE FROM purchases WHERE id=$1", [req.params.id]);
    await client.query("COMMIT");
    res.json({ ok: true, message: "Compra anulada y stock revertido" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al anular compra" });
  } finally {
    client.release();
  }
};

module.exports = { getAll, getOne, create, remove };