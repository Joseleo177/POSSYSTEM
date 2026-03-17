const pool = require("../db/pool");

// GET /api/customers
const getAll = async (req, res) => {
  try {
    const { search, type } = req.query;
    let query = `
      SELECT c.*,
             COUNT(s.id)               AS total_purchases,
             COALESCE(SUM(s.total), 0) AS total_spent
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];
    if (type && ["cliente", "proveedor"].includes(type)) {
      params.push(type);
      query += ` AND c.type = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.rif ILIKE $${params.length} OR c.tax_name ILIKE $${params.length})`;
    }
    query += " GROUP BY c.id ORDER BY c.name ASC";

    const { rows } = await pool.query(query, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

// GET /api/customers/:id
const getOne = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
              COUNT(s.id)               AS total_purchases,
              COALESCE(SUM(s.total), 0) AS total_spent,
              MAX(s.created_at)         AS last_purchase_at
       FROM customers c
       LEFT JOIN sales s ON s.customer_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: "Cliente no encontrado" });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener cliente" });
  }
};

// GET /api/customers/:id/purchases
const getPurchases = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    // Verify customer exists
    const { rows: check } = await pool.query("SELECT id, name FROM customers WHERE id = $1", [req.params.id]);
    if (!check.length) return res.status(404).json({ ok: false, message: "Cliente no encontrado" });

    const { rows: sales } = await pool.query(
      `SELECT s.id, s.total, s.paid, s.change, s.created_at,
              json_agg(json_build_object(
                'name',     si.name,
                'price',    si.price,
                'quantity', si.quantity,
                'subtotal', si.subtotal
              ) ORDER BY si.id) AS items
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       WHERE s.customer_id = $1
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );

    const { rows: [{ count }] } = await pool.query(
      "SELECT COUNT(*) FROM sales WHERE customer_id = $1", [req.params.id]
    );

    res.json({ ok: true, customer: check[0], data: sales, total: parseInt(count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener historial" });
  }
};

// POST /api/customers
const create = async (req, res) => {
  try {
    const { type, name, phone, email, address, rif, tax_name, notes } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "El nombre es requerido" });
    const recordType = ["cliente", "proveedor"].includes(type) ? type : "cliente";

    const { rows } = await pool.query(
      `INSERT INTO customers (type, name, phone, email, address, rif, tax_name, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [recordType, name, phone||null, email||null, address||null, rif?.toUpperCase()||null,
       recordType === "proveedor" ? (tax_name||null) : null,
       notes||null]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      const field = err.constraint?.includes("email") ? "correo" : "RIF/Cédula";
      return res.status(409).json({ ok: false, message: `Ese ${field} ya está registrado` });
    }
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear registro" });
  }
};

// PUT /api/customers/:id
const update = async (req, res) => {
  try {
    const { type, name, phone, email, address, rif, tax_name, notes } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "El nombre es requerido" });
    const recordType = ["cliente", "proveedor"].includes(type) ? type : "cliente";

    const { rows } = await pool.query(
      `UPDATE customers
       SET type=$1, name=$2, phone=$3, email=$4, address=$5, rif=$6, tax_name=$7, notes=$8
       WHERE id=$9 RETURNING *`,
      [recordType, name, phone||null, email||null, address||null, rif?.toUpperCase()||null,
       recordType === "proveedor" ? (tax_name||null) : null,
       notes||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: "Registro no encontrado" });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      const field = err.constraint?.includes("email") ? "correo" : "RIF/Cédula";
      return res.status(409).json({ ok: false, message: `Ese ${field} ya está registrado` });
    }
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar registro" });
  }
};

// DELETE /api/customers/:id
const remove = async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM customers WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ ok: false, message: "Cliente no encontrado" });
    res.json({ ok: true, message: "Cliente eliminado" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al eliminar cliente" });
  }
};

module.exports = { getAll, getOne, getPurchases, create, update, remove };
