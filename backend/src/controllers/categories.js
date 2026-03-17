const pool = require("../db/pool");

const getAll = async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM categories ORDER BY name ASC");
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener categorías" });
  }
};

const create = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "name es requerido" });
    const { rows } = await pool.query(
      "INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *",
      [name]
    );
    if (!rows.length) return res.status(409).json({ ok: false, message: "Categoría ya existe" });
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al crear categoría" });
  }
};

const update = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "name es requerido" });
    const { rows } = await pool.query(
      "UPDATE categories SET name=$1 WHERE id=$2 RETURNING *",
      [name, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: "Categoría no encontrada" });
    res.json({ ok: true, data: rows[0] });
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
    const { rowCount } = await pool.query("DELETE FROM categories WHERE id=$1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ ok: false, message: "Categoría no encontrada" });
    res.json({ ok: true, message: "Categoría eliminada" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al eliminar categoría" });
  }
};

module.exports = { getAll, create, update, remove };
