const pool = require("../db/pool");

// GET /api/payment-journals
const getAll = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT pj.*,
             cur.code   AS currency_code,
             cur.symbol AS currency_symbol,
             cur.is_base AS currency_is_base,
             b.name     AS bank_name
      FROM payment_journals pj
      LEFT JOIN currencies cur ON cur.id = pj.currency_id
      LEFT JOIN banks      b   ON b.id   = pj.bank_id
      ORDER BY pj.sort_order ASC, pj.id ASC
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener diarios" });
  }
};

// POST /api/payment-journals
const create = async (req, res) => {
  try {
    const { name, type, bank_id, color, sort_order, currency_id } = req.body;
    if (!name)
      return res.status(400).json({ ok: false, message: "El nombre es requerido" });
    const { rows } = await pool.query(
      "INSERT INTO payment_journals (name, type, bank_id, color, sort_order, currency_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [name, type || null, bank_id || null, color || "#555555", sort_order ?? 0, currency_id || null]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al crear diario" });
  }
};

// PUT /api/payment-journals/:id
const update = async (req, res) => {
  try {
    const { name, type, bank_id, color, active, sort_order, currency_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE payment_journals
       SET name=$1, type=$2, bank_id=$3, color=$4, active=$5, sort_order=$6, currency_id=$7
       WHERE id=$8 RETURNING *`,
      [name, type || null, bank_id || null, color || "#555555", active ?? true, sort_order ?? 0, currency_id || null, req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, message: "Diario no encontrado" });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al actualizar diario" });
  }
};

// DELETE /api/payment-journals/:id
const remove = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT COUNT(*) FROM sales WHERE payment_journal_id = $1", [req.params.id]
    );
    if (parseInt(rows[0].count) > 0)
      return res.status(400).json({ ok: false, message: "No se puede eliminar: tiene ventas asociadas" });
    await pool.query("DELETE FROM payment_journals WHERE id = $1", [req.params.id]);
    res.json({ ok: true, message: "Diario eliminado" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al eliminar diario" });
  }
};

// GET /api/payment-journals/summary  — balance por diario en su propia moneda
const summary = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let dateFilter = "";
    const params = [];
    if (date_from) { params.push(date_from); dateFilter += ` AND s.created_at >= $${params.length}::date`; }
    if (date_to)   { params.push(date_to);   dateFilter += ` AND s.created_at <  ($${params.length}::date + INTERVAL '1 day')`; }

    const { rows } = await pool.query(`
      SELECT
        pj.id,
        pj.name,
        pj.type,
        pj.bank_id,
        b.name      AS bank_name,
        pj.color,
        pj.currency_id,
        cur.code    AS currency_code,
        cur.symbol  AS currency_symbol,
        cur.is_base AS currency_is_base,
        COUNT(s.id) AS tx_count,
        COALESCE(SUM(
          CASE
            WHEN cur.id IS NULL OR cur.is_base = TRUE THEN s.total
            ELSE s.total * s.exchange_rate
          END
        ), 0) AS total_ingresos,
        COALESCE(SUM(
          CASE WHEN s.created_at >= CURRENT_DATE THEN
            CASE
              WHEN cur.id IS NULL OR cur.is_base = TRUE THEN s.total
              ELSE s.total * s.exchange_rate
            END
          END
        ), 0) AS ingresos_hoy
      FROM payment_journals pj
      LEFT JOIN currencies cur ON cur.id = pj.currency_id
      LEFT JOIN banks      b   ON b.id   = pj.bank_id
      LEFT JOIN sales s ON s.payment_journal_id = pj.id ${dateFilter.replace(/\$(\d+)/g, (_, n) => `$${n}`)}
      WHERE pj.active = TRUE
      GROUP BY pj.id, cur.id, cur.code, cur.symbol, cur.is_base, b.name
      ORDER BY pj.sort_order, pj.id
    `, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener resumen" });
  }
};

module.exports = { getAll, create, update, remove, summary };
