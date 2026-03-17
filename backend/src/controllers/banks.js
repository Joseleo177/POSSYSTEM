const pool = require("../db/pool");

// ══════════════════════════════════════════════════════════════
//  BANCOS
// ══════════════════════════════════════════════════════════════

// GET /api/banks
const getAllBanks = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*,
             COUNT(pj.id)::int AS journals_count
      FROM banks b
      LEFT JOIN payment_journals pj ON pj.bank_id = b.id
      GROUP BY b.id
      ORDER BY b.sort_order, b.name
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener bancos" });
  }
};

// POST /api/banks
const createBank = async (req, res) => {
  try {
    const { name, code, sort_order = 0 } = req.body;
    if (!name?.trim())
      return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const { rows: [bank] } = await pool.query(`
      INSERT INTO banks (name, code, sort_order)
      VALUES ($1, $2, $3) RETURNING *
    `, [name.trim(), code?.trim() || null, sort_order]);

    res.status(201).json({ ok: true, data: bank });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ ok: false, message: "Ya existe un banco con ese nombre" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear banco" });
  }
};

// PUT /api/banks/:id
const updateBank = async (req, res) => {
  try {
    const { name, code, active, sort_order } = req.body;
    if (!name?.trim())
      return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const { rows: [bank] } = await pool.query(`
      UPDATE banks
      SET name = $1, code = $2, active = $3, sort_order = $4
      WHERE id = $5 RETURNING *
    `, [name.trim(), code?.trim() || null, active ?? true, sort_order ?? 0, req.params.id]);

    if (!bank)
      return res.status(404).json({ ok: false, message: "Banco no encontrado" });

    res.json({ ok: true, data: bank });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ ok: false, message: "Ya existe un banco con ese nombre" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar banco" });
  }
};

// DELETE /api/banks/:id
const deleteBank = async (req, res) => {
  try {
    // Bloquear si tiene diarios asignados
    const { rows: [{ count }] } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM payment_journals WHERE bank_id = $1",
      [req.params.id]
    );
    if (count > 0)
      return res.status(400).json({
        ok: false,
        message: `No se puede eliminar: ${count} diario(s) usan este banco. Desasígnalos primero.`
      });

    const { rowCount } = await pool.query(
      "DELETE FROM banks WHERE id = $1", [req.params.id]
    );
    if (!rowCount)
      return res.status(404).json({ ok: false, message: "Banco no encontrado" });

    res.json({ ok: true, message: "Banco eliminado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar banco" });
  }
};

// ══════════════════════════════════════════════════════════════
//  MÉTODOS DE PAGO
// ══════════════════════════════════════════════════════════════

// GET /api/payment-methods
const getAllMethods = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT pm.*,
             COUNT(s.id)::int AS sales_count
      FROM payment_methods pm
      LEFT JOIN sales s ON s.payment_method_id = pm.id
      GROUP BY pm.id
      ORDER BY pm.sort_order, pm.name
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener métodos de pago" });
  }
};

// POST /api/payment-methods
const createMethod = async (req, res) => {
  try {
    const { name, code, icon = "💳", color = "#555555", sort_order = 0 } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, message: "El nombre es requerido" });
    if (!code?.trim()) return res.status(400).json({ ok: false, message: "El código es requerido" });

    // Normalizar código: minúsculas, sin espacios
    const normalizedCode = code.trim().toLowerCase().replace(/\s+/g, "_");

    const { rows: [method] } = await pool.query(`
      INSERT INTO payment_methods (name, code, icon, color, sort_order)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [name.trim(), normalizedCode, icon, color, sort_order]);

    res.status(201).json({ ok: true, data: method });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ ok: false, message: "Ya existe un método con ese nombre o código" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear método de pago" });
  }
};

// PUT /api/payment-methods/:id
const updateMethod = async (req, res) => {
  try {
    const { name, icon, color, active, sort_order } = req.body;
    // Nota: el código NO se puede editar (es clave de integridad histórica)
    if (!name?.trim())
      return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const { rows: [method] } = await pool.query(`
      UPDATE payment_methods
      SET name = $1, icon = $2, color = $3, active = $4, sort_order = $5
      WHERE id = $6 RETURNING *
    `, [name.trim(), icon || "💳", color || "#555555", active ?? true, sort_order ?? 0, req.params.id]);

    if (!method)
      return res.status(404).json({ ok: false, message: "Método de pago no encontrado" });

    res.json({ ok: true, data: method });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ ok: false, message: "Ya existe un método con ese nombre" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar método de pago" });
  }
};

// DELETE /api/payment-methods/:id
const deleteMethod = async (req, res) => {
  try {
    // Bloquear si tiene ventas registradas
    const { rows: [{ count }] } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM sales WHERE payment_method_id = $1",
      [req.params.id]
    );
    if (count > 0)
      return res.status(400).json({
        ok: false,
        message: `No se puede eliminar: tiene ${count} venta(s) registrada(s). Solo puedes desactivarlo.`
      });

    // Bloquear si tiene diarios asignados
    const { rows: [{ jcount }] } = await pool.query(
      "SELECT COUNT(*)::int AS jcount FROM payment_journals WHERE type = (SELECT code FROM payment_methods WHERE id = $1)",
      [req.params.id]
    );
    if (jcount > 0)
      return res.status(400).json({
        ok: false,
        message: `No se puede eliminar: ${jcount} diario(s) usan este método. Cámbialos primero.`
      });

    const { rowCount } = await pool.query(
      "DELETE FROM payment_methods WHERE id = $1", [req.params.id]
    );
    if (!rowCount)
      return res.status(404).json({ ok: false, message: "Método de pago no encontrado" });

    res.json({ ok: true, message: "Método de pago eliminado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar método de pago" });
  }
};

// PUT /api/payment-methods/:id/toggle
const toggleMethod = async (req, res) => {
  try {
    const { rows: [method] } = await pool.query(
      "UPDATE payment_methods SET active = NOT active WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!method)
      return res.status(404).json({ ok: false, message: "Método no encontrado" });
    res.json({ ok: true, data: method });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al cambiar estado" });
  }
};

// PUT /api/banks/:id/toggle
const toggleBank = async (req, res) => {
  try {
    const { rows: [bank] } = await pool.query(
      "UPDATE banks SET active = NOT active WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!bank)
      return res.status(404).json({ ok: false, message: "Banco no encontrado" });
    res.json({ ok: true, data: bank });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al cambiar estado" });
  }
};

module.exports = {
  getAllBanks, createBank, updateBank, deleteBank, toggleBank,
  getAllMethods, createMethod, updateMethod, deleteMethod, toggleMethod,
};