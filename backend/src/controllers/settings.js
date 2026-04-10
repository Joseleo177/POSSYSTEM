const { Setting, sequelize } = require("../models");
const path = require("path");
const fs   = require("fs");

const isSupabase = () => !!process.env.SUPABASE_URL;
const getSupabaseStorage = () => require("../config/supabase");

// GET /api/settings
const getAll = async (req, res) => {
  try {
    const rows = await Setting.findAll({ order: [['key', 'ASC']] });
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (settings.logo_filename) {
      // Si es URL completa (Supabase) la usamos directo, si no construimos ruta local
      settings.logo_url = settings.logo_filename.startsWith("http")
        ? settings.logo_filename
        : `/uploads/${settings.logo_filename}`;
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

    let logoValue;

    if (isSupabase()) {
      // Eliminar logo anterior de Supabase
      if (old && old.startsWith("http")) {
        const oldFilename = old.split("/").pop();
        await getSupabaseStorage().deleteImage(oldFilename);
      }

      // Subir nuevo logo a Supabase
      const ext = path.extname(req.file.originalname).toLowerCase();
      const filename = `logo_${Date.now()}${ext}`;
      logoValue = await getSupabaseStorage().uploadImage(req.file.buffer, filename, req.file.mimetype);
    } else {
      // Eliminar logo anterior del disco
      if (old) {
        const p = path.join(__dirname, "../../uploads", old);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      logoValue = req.file.filename;
    }

    await Setting.upsert({ key: 'logo_filename', value: logoValue });

    res.json({
      ok: true,
      logo_url: logoValue.startsWith("http") ? logoValue : `/uploads/${logoValue}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al subir logo" });
  }
};

module.exports = { getAll, update, uploadLogo };
