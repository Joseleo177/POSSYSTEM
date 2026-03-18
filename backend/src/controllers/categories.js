const { Category } = require("../models");
const pool = require("../db/pool"); // Conservado por si aca

const getAll = async (req, res) => {
  try {
    const categories = await Category.findAll({ order: [['name', 'ASC']] });
    res.json({ ok: true, data: categories });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener categorías" });
  }
};

const create = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "name es requerido" });
    const [category, created] = await Category.findOrCreate({
      where: { name },
      defaults: { name }
    });
    if (!created) return res.status(409).json({ ok: false, message: "Categoría ya existe" });
    res.status(201).json({ ok: true, data: category });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al crear categoría" });
  }
};

const update = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "name es requerido" });
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ ok: false, message: "Categoría no encontrada" });
    
    await category.update({ name });
    res.json({ ok: true, data: category });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al actualizar categoría" });
  }
};

const remove = async (req, res) => {
  try {
    const { rows: prods } = await pool.query(
      "SELECT id FROM products WHERE category_id=$1 LIMIT 1", [req.params.id]
    );
    if (prods.length) return res.status(409).json({ ok: false, message: "La categoría tiene productos asociados" });
    
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ ok: false, message: "Categoría no encontrada" });
    
    await category.destroy();
    res.json({ ok: true, message: "Categoría eliminada" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al eliminar categoría" });
  }
};

module.exports = { getAll, create, update, remove };
