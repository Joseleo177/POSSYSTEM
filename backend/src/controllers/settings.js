const { Setting, sequelize } = require("../models");
const path = require("path");
const fs   = require("fs");

const isSupabase = () => !!process.env.SUPABASE_URL;
const getSupabaseStorage = () => require("../config/supabase");

// GET /api/settings
const getAll = async (req, res) => {
  try {
    const company_id = req.employee?.company_id ?? null;
    const where = company_id ? { company_id } : {};
    const rows = await Setting.findAll({ where, order: [['key', 'ASC']] });
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    // Claves que una versión anterior dejó guardadas aquí: lo que vale es la columna de
    // companies (va en `company`). Se ocultan para que nadie las lea ni las reenvíe.
    delete settings.fiscal_enabled;
    delete settings.print_format;
    if (settings.logo_filename) {
      // Si es URL completa (Supabase) la usamos directo, si no construimos ruta local
      settings.logo_url = settings.logo_filename.startsWith("http")
        ? settings.logo_filename
        : `/uploads/${settings.logo_filename}`;
    }

    let companyInfo = null;
    if (company_id) {
      const { Company, Employee } = require("../models");
      const company = await Company.findByPk(company_id, {
        attributes: ['id', 'name', 'tax_id', 'plan_name', 'subscription_status', 'expires_at', 'max_users', 'catalog_enabled', 'fabrica_enabled', 'cocina_enabled', 'pedidos_web_enabled', 'comisiones_enabled', 'propinas_enabled', 'citas_enabled', 'cobranza_enabled', 'iva_enabled', 'catalogo_pdf_enabled', 'mayor_enabled', 'farmacia_enabled', 'print_format', 'fiscal_enabled', 'asistente_enabled', 'asistente_plan']
      });
      if (company) {
        const userCount = await Employee.count({ where: { company_id, active: true } });
        companyInfo = {
          ...company.toJSON(),
          current_users: userCount
        };
      }
    }

    res.json({ ok: true, data: settings, company: companyInfo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener configuración" });
  }
};

// Formato de entrega por sucursal que elige la tienda: { "<warehouse_id>": "ticket" | "carta" |
// "digital" }. Sin elección para una sucursal vale el de la empresa (companies.print_format).
// Se guarda limpio: un valor desconocido haría que la caja no supiera qué imprimir.
const FORMATOS_ENTREGA = new Set(["ticket", "carta", "digital"]);
const limpiarFormatos = (v) => {
  let m = v;
  if (typeof v === "string") { try { m = JSON.parse(v || "{}"); } catch { m = {}; } }
  if (!m || typeof m !== "object" || Array.isArray(m)) return "{}";
  return JSON.stringify(Object.fromEntries(
    Object.entries(m).filter(([id, f]) => /^\d+$/.test(id) && FORMATOS_ENTREGA.has(f))
  ));
};

// PUT /api/settings
const update = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const company_id = req.employee?.company_id ?? null;
    // La máquina fiscal es un extra de la empresa y el formato de entrega por defecto también
    // lo fija el superusuario (Empresas → controllers/companies.js). Desde aquí la tienda no los
    // toca, ni en `companies` ni como clave suelta en `settings`; antes podía encenderse la
    // máquina fiscal ella misma, y guardar cualquier ajuste reenviaba una clave vieja que la
    // apagaba. Lo que la tienda sí elige es el formato de cada sucursal
    // (print_format_by_warehouse), que manda sobre el de la empresa.
    const SOLO_SUPERUSUARIO = new Set(["logo_filename", "logo_url", "fiscal_enabled", "print_format"]);
    const entries = Object.entries(req.body)
      .filter(([k]) => !SOLO_SUPERUSUARIO.has(k))
      .map(([k, v]) => (k === "print_format_by_warehouse" ? [k, limpiarFormatos(v)] : [k, v]));

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
    console.error("ERROR uploadLogo:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
    res.status(500).json({ ok: false, message: err.message || "Error al subir logo" });
  }
};

module.exports = { getAll, update, uploadLogo };
