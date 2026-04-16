const { Setting, sequelize } = require("../models");
const path = require("path");
const fs   = require("fs");

const isSupabase = () => !!process.env.SUPABASE_URL;
const getSupabaseStorage = () => require("../config/supabase");

// GET /api/settings
const getAll = async (req, res) => {
  try {
    const company_id = req.employee?.company_id ?? null;
    const isSuperuser = !!req.is_superuser;
    const where = (!isSuperuser && company_id) ? { company_id } : {};
    const rows = await Setting.findAll({ where, order: [['key', 'ASC']] });
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
    const company_id = req.employee?.company_id ?? null;
    const entries = Object.entries(req.body).filter(([k]) => k !== "logo_filename" && k !== "logo_url");

    for (const [key, value] of entries) {
      await Setting.upsert({ key, value: value ?? "", company_id }, { transaction });
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

    const company_id = req.employee?.company_id ?? null;
    const setting = await Setting.findOne({ where: { key: 'logo_filename', company_id } });
    const old = setting?.value;

    const ext = path.extname(req.file.originalname).toLowerCase();
    const filename = `logo_${company_id}_${Date.now()}${ext}`;

    let logoValue;

    if (isSupabase()) {
      // Eliminar logo anterior de Supabase
      if (old && old.startsWith("http")) {
        const oldFilename = old.split("/").pop();
        await getSupabaseStorage().deleteImage(oldFilename);
      }
      // Subir nuevo logo a Supabase
      logoValue = await getSupabaseStorage().uploadImage(req.file.buffer, filename, req.file.mimetype);
    } else {
      // Modo Local: Guardar en disco
      const uploadsDir = path.join(__dirname, "../../uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      // Eliminar logo anterior del disco
      if (old && !old.startsWith("http")) {
        const oldPath = path.join(uploadsDir, old);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      const p = path.join(uploadsDir, filename);
      fs.writeFileSync(p, req.file.buffer);
      logoValue = filename;
    }

    await Setting.upsert({ key: 'logo_filename', value: logoValue, company_id });

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
