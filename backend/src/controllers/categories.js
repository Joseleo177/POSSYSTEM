const { Category, Product } = require("../models");
const { imageUrl, saveImage, deleteImage } = require("../utils/imageStorage");

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
  return { ...j, image_url: imageUrl(j.image_filename) };
};

const getAll = async (req, res) => {
  try {
    const categories = await Category.findAll({
      order: [['name', 'ASC']],
      attributes: {
        include: [
          [
            Category.sequelize.literal(
              `(SELECT COUNT(*) FROM products WHERE products.category_id = "Category".id)`
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
    const { name, color, short_description } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "name es requerido" });
    const company_id = tenant(req);
    const [category, created] = await Category.findOrCreate({
      where: { name: name.trim(), company_id },
      defaults: { name: name.trim(), color: color || null, short_description: short_description || null, company_id }
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
    const { name, color, short_description } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "name es requerido" });
    const category = await Category.findOne({ where: { id: req.params.id, company_id: tenant(req) } });
    if (!category) return res.status(404).json({ ok: false, message: "Categoría no encontrada" });

    const patch = { name: name.trim(), color: color || null, short_description: short_description || null };

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
