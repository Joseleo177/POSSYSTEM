const pool = require("../db/pool"); // settings is a key/value table, best served with raw queries
const path = require("path");
const fs   = require("fs");

// GET /api/settings
const getAll = async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM settings ORDER BY key");
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (settings.logo_filename) {
      settings.logo_url = `${req.protocol}://${req.get("host")}/uploads/${settings.logo_filename}`;
    }
    res.json({ ok: true, data: settings });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener configuración" });
  }
};

// PUT /api/settings
const update = async (req, res) => {
  const client = await pool.connect();
  try {
    const entries = Object.entries(req.body).filter(([k]) => k !== "logo_filename" && k !== "logo_url");
    await client.query("BEGIN");
    for (const [key, value] of entries) {
      await client.query(
        "INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2",
        [key, value ?? ""]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, message: "Configuración guardada" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al guardar configuración" });
  } finally {
    client.release();
  }
};

// POST /api/settings/logo
const uploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: "No se recibió imagen" });

    const { rows } = await pool.query("SELECT value FROM settings WHERE key='logo_filename'");
    const old = rows[0]?.value;
    if (old) {
      const p = path.join(__dirname, "../../uploads", old);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    await pool.query(
      "INSERT INTO settings (key,value) VALUES ('logo_filename',$1) ON CONFLICT (key) DO UPDATE SET value=$1",
      [req.file.filename]
    );
    res.json({
      ok: true,
      logo_url: `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al subir logo" });
  }
};

module.exports = { getAll, update, uploadLogo };
