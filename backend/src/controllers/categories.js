const { Category, Product, sequelize } = require("../models");
const { imageUrl, saveImage, deleteImage } = require("../utils/imageStorage");
const { visibleWarehouseIds } = require("../middleware/auth");
const { condicionSucursal } = require("../services/products/productAccess");

let _subcatReady = null;
function ensureSubcatColumns() {
  if (!_subcatReady) {
    _subcatReady = sequelize.query(`
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS subcategories JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);
    `).catch(() => {});
  }
  return _subcatReady;
}

function parseSubcategories(raw) {
  if (raw === undefined) return undefined;
  let arr = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try { arr = JSON.parse(trimmed); }
    catch { arr = trimmed.split(","); }
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const s = String(item ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

// create y update filtran por company_id a mano, y no por el hook de tenant como hacía este
// controlador antes.
//
// No es preferencia: desde que la ruta acepta la foto de la categoría pasa por multer, y el
// parseo de multipart rompe el AsyncLocalStorage que lleva el company_id (el mismo motivo por
// el que products lo pasa explícito en todo su servicio). Sin esto, crear una categoría con
// foto fallaba con un INSERT sin company_id, y peor: un update por id podía alcanzar la
// categoría de otra empresa. getAll y remove no reciben archivos y siguen apoyándose en el
// hook, pero llevan el filtro igual para que las cuatro operaciones se lean iguales.
const tenant = (req) => req.employee?.company_id ?? null;

// La foto es opcional y solo la usa la vitrina pública, así que el resto del sistema sigue
// creando categorías con un JSON normal: cuando no viene multipart, req.file no existe y
// aquí no cambia nada.
const withUrl = (c) => {
  const j = typeof c.toJSON === "function" ? c.toJSON() : c;
  const subcategories = Array.isArray(j.subcategories) ? j.subcategories.map(s => String(s ?? "").trim()).filter(Boolean) : [];
  return { ...j, subcategories, image_url: imageUrl(j.image_filename) };
};

const getAll = async (req, res) => {
  try {
    await ensureSubcatColumns();
    // Las categorías son de la empresa, pero el conteo es de lo que ve quien consulta: a una
    // sucursal le decía "120 productos" en Víveres cuando ella maneja 10.
    const visibles = await visibleWarehouseIds(req);
    const deLaSucursal = visibles ? `AND ${condicionSucursal("products", visibles)}` : "";
    const categories = await Category.findAll({
      order: [['name', 'ASC']],
      attributes: {
        include: [
          [
            Category.sequelize.literal(
              `(SELECT COUNT(*) FROM products WHERE products.category_id = "Category".id ${deLaSucursal})`
            ),
            'product_count',
          ],
        ],
      },
    });
    res.json({ ok: true, data: categories.map(withUrl) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener categorías" });
  }
};

const create = async (req, res) => {
  try {
    await ensureSubcatColumns();
    const { name, color, short_description, subcategories } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "name es requerido" });
    const company_id = tenant(req);
    const subcats = parseSubcategories(subcategories) ?? [];
    const [category, created] = await Category.findOrCreate({
      where: { name: name.trim(), company_id },
      defaults: { name: name.trim(), color: color || null, short_description: short_description || null, subcategories: subcats, company_id }
    });
    if (!created) return res.status(409).json({ ok: false, message: "Categoría ya existe" });

    // Después del findOrCreate: subir la imagen de una categoría que resultó duplicada
    // dejaría el archivo huérfano en el disco.
    if (req.file) {
      await category.update({ image_filename: await saveImage(req.file, "category") });
    }

    res.status(201).json({ ok: true, data: withUrl(category) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear categoría" });
  }
};

const update = async (req, res) => {
  try {
    await ensureSubcatColumns();
    const { name, color, short_description, subcategories } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "name es requerido" });
    const category = await Category.findOne({ where: { id: req.params.id, company_id: tenant(req) } });
    if (!category) return res.status(404).json({ ok: false, message: "Categoría no encontrada" });

    const subcats = parseSubcategories(subcategories);
    const patch = {
      name: name.trim(),
      color: color || null,
      short_description: short_description || null,
      ...(subcats !== undefined ? { subcategories: subcats } : {}),
    };

    if (req.file) {
      const old = category.image_filename;
      patch.image_filename = await saveImage(req.file, "category");
      await deleteImage(old);
    } else if (req.body.clear_image === "true" || req.body.clear_image === true) {
      // Quitar la foto es explícito: no mandar archivo es lo que pasa en cada guardado
      // normal, así que no puede significar "bórrala".
      await deleteImage(category.image_filename);
      patch.image_filename = null;
    }

    await category.update(patch);
    res.json({ ok: true, data: withUrl(category) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar categoría" });
  }
};

const remove = async (req, res) => {
  try {
    const productCount = await Product.count({ where: { category_id: req.params.id } });
    if (productCount > 0) {
      return res.status(409).json({ ok: false, message: "La categoría tiene productos asociados" });
    }

    const category = await Category.findOne({ where: { id: req.params.id, company_id: tenant(req) } });
    if (!category) return res.status(404).json({ ok: false, message: "Categoría no encontrada" });

    const image = category.image_filename;
    await category.destroy();
    await deleteImage(image);
    res.json({ ok: true, message: "Categoría eliminada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar categoría" });
  }
};

module.exports = { getAll, create, update, remove };
