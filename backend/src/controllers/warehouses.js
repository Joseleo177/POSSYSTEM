const pool = require("../db/pool");

// ── GET /api/warehouses ───────────────────────────────────────
const getAll = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        w.*,
        COUNT(DISTINCT ps.product_id)::int        AS product_count,
        COALESCE(SUM(ps.qty), 0)                  AS total_stock,
        json_agg(
          json_build_object('employee_id', ew.employee_id)
        ) FILTER (WHERE ew.employee_id IS NOT NULL) AS assigned_employees
      FROM warehouses w
      LEFT JOIN product_stock       ps ON ps.warehouse_id = w.id
      LEFT JOIN employee_warehouses ew ON ew.warehouse_id = w.id
      GROUP BY w.id
      ORDER BY w.sort_order, w.name
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener almacenes" });
  }
};

// ── GET /api/warehouses/:id/stock ─────────────────────────────
const getStock = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ps.product_id,
        ps.qty,
        p.name        AS product_name,
        p.unit,
        p.price,
        p.cost_price,
        p.image_filename,
        c.name        AS category_name
      FROM product_stock ps
      JOIN products    p ON p.id = ps.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ps.warehouse_id = $1
      ORDER BY c.name, p.name
    `, [req.params.id]);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener stock" });
  }
};

// ── GET /api/warehouses/employee/:employeeId ──────────────────
const getByEmployee = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT w.*
      FROM warehouses w
      JOIN employee_warehouses ew ON ew.warehouse_id = w.id
      WHERE ew.employee_id = $1 AND w.active = TRUE
      ORDER BY w.sort_order, w.name
    `, [req.params.employeeId]);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener almacenes del empleado" });
  }
};

// ── POST /api/warehouses ──────────────────────────────────────
// El almacén nace vacío — los productos entran via compras o transferencias
const create = async (req, res) => {
  try {
    const { name, description, sort_order = 0 } = req.body;
    if (!name?.trim())
      return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const { rows: [warehouse] } = await pool.query(`
      INSERT INTO warehouses (name, description, sort_order)
      VALUES ($1, $2, $3) RETURNING *
    `, [name.trim(), description || null, sort_order]);

    res.status(201).json({ ok: true, data: warehouse });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ ok: false, message: "Ya existe un almacén con ese nombre" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear almacén" });
  }
};

// ── PUT /api/warehouses/:id ───────────────────────────────────
const update = async (req, res) => {
  try {
    const { name, description, active, sort_order } = req.body;
    if (!name?.trim())
      return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const { rows: [warehouse] } = await pool.query(`
      UPDATE warehouses
      SET name = $1, description = $2, active = $3, sort_order = $4
      WHERE id = $5 RETURNING *
    `, [name.trim(), description || null, active ?? true, sort_order ?? 0, req.params.id]);

    if (!warehouse)
      return res.status(404).json({ ok: false, message: "Almacén no encontrado" });

    res.json({ ok: true, data: warehouse });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ ok: false, message: "Ya existe un almacén con ese nombre" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar almacén" });
  }
};

// ── DELETE /api/warehouses/:id ────────────────────────────────
const remove = async (req, res) => {
  try {
    const { rows: [{ total }] } = await pool.query(
      "SELECT COALESCE(SUM(qty), 0) AS total FROM product_stock WHERE warehouse_id = $1",
      [req.params.id]
    );
    if (parseFloat(total) > 0)
      return res.status(400).json({ ok: false, message: "No se puede eliminar un almacén con stock. Transfiere o ajusta el stock primero." });

    const { rowCount } = await pool.query(
      "DELETE FROM warehouses WHERE id = $1", [req.params.id]
    );
    if (!rowCount)
      return res.status(404).json({ ok: false, message: "Almacén no encontrado" });

    res.json({ ok: true, message: "Almacén eliminado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar almacén" });
  }
};

// ── POST /api/warehouses/transfer ────────────────────────────
const transfer = async (req, res) => {
  const client = await pool.connect();
  try {
    const { from_warehouse_id, to_warehouse_id, product_id, qty, note } = req.body;

    if (!to_warehouse_id || !product_id || !qty)
      return res.status(400).json({ ok: false, message: "to_warehouse_id, product_id y qty son requeridos" });
    if (from_warehouse_id && parseInt(from_warehouse_id) === parseInt(to_warehouse_id))
      return res.status(400).json({ ok: false, message: "El almacén origen y destino deben ser distintos" });

    const parsedQty = parseFloat(qty);
    if (isNaN(parsedQty) || parsedQty <= 0)
      return res.status(400).json({ ok: false, message: "La cantidad debe ser mayor a 0" });

    await client.query("BEGIN");

    const { rows: [product] } = await client.query(
      "SELECT name FROM products WHERE id = $1", [product_id]
    );
    if (!product) throw new Error("Producto no encontrado");

    if (from_warehouse_id) {
      const { rows: [stockRow] } = await client.query(
        "SELECT qty FROM product_stock WHERE warehouse_id = $1 AND product_id = $2 FOR UPDATE",
        [from_warehouse_id, product_id]
      );
      const available = parseFloat(stockRow?.qty || 0);
      if (available < parsedQty)
        throw new Error(`Stock insuficiente en el almacén origen. Disponible: ${available}`);

      await client.query(
        "UPDATE product_stock SET qty = qty - $1 WHERE warehouse_id = $2 AND product_id = $3",
        [parsedQty, from_warehouse_id, product_id]
      );
    }

    // Upsert en destino — funciona aunque el producto no exista aún en ese almacén
    await client.query(`
      INSERT INTO product_stock (warehouse_id, product_id, qty)
      VALUES ($1, $2, $3)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET qty = product_stock.qty + EXCLUDED.qty
    `, [to_warehouse_id, product_id, parsedQty]);

    const { rows: [transferRow] } = await client.query(`
      INSERT INTO stock_transfers
        (from_warehouse_id, to_warehouse_id, product_id, product_name, qty, note, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      from_warehouse_id || null,
      to_warehouse_id,
      product_id,
      product.name,
      parsedQty,
      note || null,
      req.employee?.id || null,
    ]);

    // Sincronizar products.stock
    await client.query(`
      UPDATE products
      SET stock = (SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = $1)
      WHERE id = $1
    `, [product_id]);

    await client.query("COMMIT");
    res.status(201).json({ ok: true, data: transferRow });
  } catch (err) {
    await client.query("ROLLBACK");
    const status = /insuficiente|no encontrado/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  } finally {
    client.release();
  }
};

// ── GET /api/warehouses/transfers ────────────────────────────
const getTransfers = async (req, res) => {
  try {
    const { warehouse_id, product_id, limit = 50 } = req.query;
    let where = "WHERE 1=1";
    const params = [];

    if (warehouse_id) {
      params.push(warehouse_id);
      where += ` AND (st.from_warehouse_id = $${params.length} OR st.to_warehouse_id = $${params.length})`;
    }
    if (product_id) {
      params.push(product_id);
      where += ` AND st.product_id = $${params.length}`;
    }
    params.push(limit);

    const { rows } = await pool.query(`
      SELECT
        st.*,
        wf.name     AS from_warehouse_name,
        wt.name     AS to_warehouse_name,
        e.full_name AS employee_name
      FROM stock_transfers st
      LEFT JOIN warehouses wf ON wf.id = st.from_warehouse_id
      LEFT JOIN warehouses wt ON wt.id = st.to_warehouse_id
      LEFT JOIN employees  e  ON e.id  = st.employee_id
      ${where}
      ORDER BY st.created_at DESC
      LIMIT $${params.length}
    `, params);

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener transferencias" });
  }
};

// ── PUT /api/warehouses/:id/employees ────────────────────────
const assignEmployees = async (req, res) => {
  const client = await pool.connect();
  try {
    const { employee_ids = [] } = req.body;
    const warehouseId = req.params.id;

    await client.query("BEGIN");
    await client.query("DELETE FROM employee_warehouses WHERE warehouse_id = $1", [warehouseId]);
    for (const empId of employee_ids) {
      await client.query(
        "INSERT INTO employee_warehouses (employee_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [empId, warehouseId]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, message: "Empleados asignados correctamente" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al asignar empleados" });
  } finally {
    client.release();
  }
};

// ── POST /api/warehouses/:id/stock ───────────────────────────
// Agregar un producto manualmente a un almacén con cantidad inicial
const addStock = async (req, res) => {
  try {
    const { product_id, qty } = req.body;
    const warehouseId = parseInt(req.params.id);

    if (!product_id || qty == null)
      return res.status(400).json({ ok: false, message: "product_id y qty son requeridos" });

    const parsedQty = parseFloat(qty);
    if (isNaN(parsedQty) || parsedQty < 0)
      return res.status(400).json({ ok: false, message: "La cantidad debe ser mayor o igual a 0" });

    // Verificar que el producto existe
    const { rows: [product] } = await pool.query(
      "SELECT id, name FROM products WHERE id = $1", [product_id]
    );
    if (!product)
      return res.status(404).json({ ok: false, message: "Producto no encontrado" });

    // Upsert — si ya existe actualiza, si no existe lo crea
    await pool.query(`
      INSERT INTO product_stock (warehouse_id, product_id, qty)
      VALUES ($1, $2, $3)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET qty = EXCLUDED.qty
    `, [warehouseId, product_id, parsedQty]);

    // Sincronizar products.stock
    await pool.query(`
      UPDATE products
      SET stock = (SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = $1)
      WHERE id = $1
    `, [product_id]);

    res.json({ ok: true, message: `${product.name} agregado al almacén con ${parsedQty} unidades` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al agregar producto al almacén" });
  }
};
// GET /api/warehouses/:id/products
// Productos con stock del almacén específico (para cobro)
const getProducts = async (req, res) => {
  try {
    const { search } = req.query;
    let where = "WHERE ps.warehouse_id = $1";
    const params = [req.params.id];

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (p.name ILIKE $${params.length} OR c.name ILIKE $${params.length})`;
    }

    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.name,
        p.price,
        p.unit,
        p.qty_step,
        p.image_filename,
        p.cost_price,
        ps.qty          AS stock,
        c.name          AS category_name,
        c.id            AS category_id,
        CASE WHEN p.image_filename IS NOT NULL
          THEN '/uploads/' || p.image_filename
          ELSE NULL
        END             AS image_url
      FROM product_stock ps
      JOIN products    p ON p.id = ps.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      ${where}
      ORDER BY c.name, p.name
    `, params);

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener productos del almacén" });
  }
};
module.exports = {
  getAll,
  getStock,
  getByEmployee,
  getProducts,
  create,
  update,
  remove,
  transfer,
  getTransfers,
  assignEmployees,
  addStock,
};