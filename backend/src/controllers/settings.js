const { Setting, sequelize } = require("../models");
const path = require("path");
const fs   = require("fs");

// GET /api/settings
const getAll = async (req, res) => {
  try {
    const rows = await Setting.findAll({ order: [['key', 'ASC']] });
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (settings.logo_filename) {
      settings.logo_url = `${req.protocol}://${req.get("host")}/uploads/${settings.logo_filename}`;
    }
    res.json({ ok: true, data: settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener configuración" });
  }
};

// PUT /api/settings
const update = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const entries = Object.entries(req.body).filter(([k]) => k !== "logo_filename" && k !== "logo_url");
    
    for (const [key, value] of entries) {
      await Setting.upsert({ key, value: value ?? "" }, { transaction });
    }

    await transaction.commit();
    res.json({ ok: true, message: "Configuración guardada" });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al guardar configuración" });
  }
};

// POST /api/settings/logo
const uploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: "No se recibió imagen" });

    const setting = await Setting.findByPk('logo_filename');
    const old = setting?.value;
    if (old) {
      const p = path.join(__dirname, "../../uploads", old);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    await Setting.upsert({ key: 'logo_filename', value: req.file.filename });

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
