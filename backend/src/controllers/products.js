const path = require("path");
const fs   = require("fs");
const pool = require("../db/pool");

const imageUrl = (filename) =>
  filename ? `/uploads/${filename}` : null;

const deleteOldImage = (filename) => {
  if (!filename) return;
  const filepath = path.join(__dirname, "../../uploads", filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
};

// GET /api/products
const getAll = async (req, res) => {
  try {
    const { search, category_id } = req.query;
    let query = `
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (p.name ILIKE $${params.length} OR c.name ILIKE $${params.length})`;
    }
    if (category_id) {
      params.push(category_id);
      query += ` AND p.category_id = $${params.length}`;
    }
    query += " ORDER BY p.name ASC";

    const { rows } = await pool.query(query, params);
    const data = rows.map((p) => ({
      ...p,
      image_url: imageUrl(p.image_filename),
    }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener productos" });
  }
};

// GET /api/products/:id
const getOne = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: "Producto no encontrado" });
    const p = rows[0];
    res.json({ ok: true, data: { ...p, image_url: imageUrl(p.image_filename) } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener producto" });
  }
};

// POST /api/products  — multipart/form-data
const create = async (req, res) => {
  try {
    const { name, price, stock, category_id, unit, qty_step,
            cost_price, profit_margin, package_size, package_unit } = req.body;
    if (!name || price == null) {
      if (req.file) deleteOldImage(req.file.filename);
      return res.status(400).json({ ok: false, message: "name y price son requeridos" });
    }

    const filename = req.file ? req.file.filename : null;

    const { rows } = await pool.query(
      `INSERT INTO products (name, price, stock, category_id, image_filename, unit, qty_step,
                             cost_price, profit_margin, package_size, package_unit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [name, price, stock ?? 0, category_id || null, filename, unit || "unidad", qty_step || 1,
       cost_price || null, profit_margin || null, package_size || null, package_unit || null]
    );
    res.status(201).json({
      ok: true,
      data: { ...rows[0], image_url: imageUrl(filename) },
    });
  } catch (err) {
    if (req.file) deleteOldImage(req.file.filename);
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear producto" });
  }
};

// PUT /api/products/:id  — multipart/form-data
const update = async (req, res) => {
  try {
    const { name, price, stock, category_id, unit, qty_step,
            cost_price, profit_margin, package_size, package_unit } = req.body;

    const { rows: prev } = await pool.query("SELECT image_filename FROM products WHERE id=$1", [req.params.id]);
    if (!prev.length) {
      if (req.file) deleteOldImage(req.file.filename);
      return res.status(404).json({ ok: false, message: "Producto no encontrado" });
    }

    let filename = prev[0].image_filename;

    if (req.file) {
      deleteOldImage(filename);
      filename = req.file.filename;
    } else if (req.body.remove_image === "true") {
      deleteOldImage(filename);
      filename = null;
    }

    const { rows } = await pool.query(
      `UPDATE products
       SET name=$1, price=$2, category_id=$3, image_filename=$4, unit=$5, qty_step=$6,
           cost_price=$7, profit_margin=$8, package_size=$9, package_unit=$10
       WHERE id=$11 RETURNING *`,
      [name, price, category_id || null, filename, unit || "unidad", qty_step || 1,
       cost_price || null, profit_margin || null, package_size || null, package_unit || null,
       req.params.id]
    );
    res.json({
      ok: true,
      data: { ...rows[0], image_url: imageUrl(filename) },
    });
  } catch (err) {
    if (req.file) deleteOldImage(req.file.filename);
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar producto" });
  }
};

// DELETE /api/products/:id
const remove = async (req, res) => {
  try {
    const { rows } = await pool.query("DELETE FROM products WHERE id=$1 RETURNING image_filename", [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: "Producto no encontrado" });
    deleteOldImage(rows[0].image_filename);
    res.json({ ok: true, message: "Producto eliminado" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al eliminar producto" });
  }
};

module.exports = { getAll, getOne, create, update, remove };
