const pool = require("../db/pool");

// GET /api/currencies
const getAll = async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM currencies ORDER BY is_base DESC, code ASC");
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener monedas" });
  }
};

// PUT /api/currencies/:id/rate  — actualizar tipo de cambio
const updateRate = async (req, res) => {
  try {
    const { exchange_rate } = req.body;
    if (!exchange_rate || exchange_rate <= 0)
      return res.status(400).json({ ok: false, message: "Tipo de cambio inválido" });

    const { rows } = await pool.query(
      "UPDATE currencies SET exchange_rate=$1 WHERE id=$2 AND is_base=FALSE RETURNING *",
      [exchange_rate, req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, message: "Moneda no encontrada o es moneda base" });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al actualizar tipo de cambio" });
  }
};

// PUT /api/currencies/:id/toggle  — activar/desactivar
const toggle = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE currencies SET active = NOT active WHERE id=$1 AND is_base=FALSE RETURNING *",
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, message: "Moneda no encontrada o es moneda base" });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al actualizar moneda" });
  }
};

// POST /api/currencies  — agregar moneda
const create = async (req, res) => {
  try {
    const { code, name, symbol, exchange_rate } = req.body;
    if (!code || !name || !symbol || !exchange_rate)
      return res.status(400).json({ ok: false, message: "Todos los campos son requeridos" });
    const { rows } = await pool.query(
      "INSERT INTO currencies (code, name, symbol, exchange_rate) VALUES ($1,$2,$3,$4) RETURNING *",
      [code.toUpperCase(), name, symbol, exchange_rate]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ ok: false, message: "Esa moneda ya existe" });
    res.status(500).json({ ok: false, message: "Error al crear moneda" });
  }
};

// POST /api/currencies/refresh  — actualizar tasas automáticamente desde API externa
const refreshRates = async (req, res) => {
  try {
    // Obtener moneda base del sistema
    const { rows: baseRows } = await pool.query("SELECT code FROM currencies WHERE is_base = TRUE LIMIT 1");
    if (!baseRows.length) return res.status(400).json({ ok: false, message: "No hay moneda base definida" });
    const baseCode = baseRows[0].code;

    // API pública de tasas (sin API key)
    const apiRes = await fetch(`https://open.er-api.com/v6/latest/${baseCode}`);
    if (!apiRes.ok) throw new Error("No se pudo conectar con la API de tasas de cambio");
    const apiData = await apiRes.json();
    if (apiData.result !== "success") throw new Error("La API de tasas devolvió un error");

    const rates = apiData.rates;

    // Actualizar todas las monedas no-base que existan en la API
    const { rows: currencies } = await pool.query(
      "SELECT id, code FROM currencies WHERE is_base = FALSE"
    );

    const updated = [];
    for (const cur of currencies) {
      const rate = rates[cur.code];
      if (rate && rate > 0) {
        await pool.query(
          "UPDATE currencies SET exchange_rate=$1, updated_at=NOW() WHERE id=$2",
          [rate, cur.id]
        );
        updated.push({ code: cur.code, rate });
      }
    }

    const { rows: result } = await pool.query("SELECT * FROM currencies ORDER BY is_base DESC, code ASC");
    res.json({ ok: true, updated, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "Error al actualizar tasas" });
  }
};

module.exports = { getAll, updateRate, toggle, create, refreshRates };
