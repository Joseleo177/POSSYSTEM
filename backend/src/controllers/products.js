const path = require("path");
const fs   = require("fs");
const { Product, Category, SaleItem, PurchaseItem, StockTransfer, ProductStock, Sequelize } = require("../models");
const Op = Sequelize.Op;

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
    const where = {};

    if (category_id) where.category_id = category_id;
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const products = await Product.findAll({
      where,
      include: [{ model: Category, attributes: ['name'], required: false }],
      order: [['name', 'ASC']]
    });

    const data = products.map(p => {
      const prod = p.toJSON();
      prod.category_name = prod.Category?.name ?? null;
      delete prod.Category;
      prod.image_url = imageUrl(prod.image_filename);
      return prod;
    });

    // Also match category name in search
    const filtered = search
      ? data.filter(p =>
          p.name?.toLowerCase().includes(search.toLowerCase()) ||
          p.category_name?.toLowerCase().includes(search.toLowerCase())
        )
      : data;

    res.json({ ok: true, data: filtered });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener productos" });
  }
};

// GET /api/products/:id
const getOne = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [{ model: Category, attributes: ['name'], required: false }]
    });
    if (!product) return res.status(404).json({ ok: false, message: "Producto no encontrado" });

    const p = product.toJSON();
    p.category_name = p.Category?.name ?? null;
    delete p.Category;
    p.image_url = imageUrl(p.image_filename);

    res.json({ ok: true, data: p });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener producto" });
  }
};

// POST /api/products
const create = async (req, res) => {
  try {
    const { name, price, stock, category_id, unit, qty_step,
            cost_price, profit_margin, package_size, package_unit } = req.body;
    if (!name || price == null) {
      if (req.file) deleteOldImage(req.file.filename);
      return res.status(400).json({ ok: false, message: "name y price son requeridos" });
    }

    const filename = req.file ? req.file.filename : null;

    const product = await Product.create({
      name,
      price,
      stock: stock ?? 0,
      category_id: category_id || null,
      image_filename: filename,
      unit: unit || "unidad",
      qty_step: qty_step || 1,
      cost_price: cost_price || null,
      profit_margin: profit_margin || null,
      package_size: package_size || null,
      package_unit: package_unit || null
    });

    res.status(201).json({
      ok: true,
      data: { ...product.toJSON(), image_url: imageUrl(filename) }
    });
  } catch (err) {
    if (req.file) deleteOldImage(req.file.filename);
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear producto" });
  }
};

// PUT /api/products/:id
const update = async (req, res) => {
  try {
    const { name, price, category_id, unit, qty_step,
            cost_price, profit_margin, package_size, package_unit } = req.body;

    const product = await Product.findByPk(req.params.id);
    if (!product) {
      if (req.file) deleteOldImage(req.file.filename);
      return res.status(404).json({ ok: false, message: "Producto no encontrado" });
    }

    let filename = product.image_filename;

    if (req.file) {
      deleteOldImage(filename);
      filename = req.file.filename;
    } else if (req.body.remove_image === "true") {
      deleteOldImage(filename);
      filename = null;
    }

    await product.update({
      name,
      price,
      category_id: category_id || null,
      image_filename: filename,
      unit: unit || "unidad",
      qty_step: qty_step || 1,
      cost_price: cost_price || null,
      profit_margin: profit_margin || null,
      package_size: package_size || null,
      package_unit: package_unit || null
    });

    res.json({
      ok: true,
      data: { ...product.toJSON(), image_url: imageUrl(filename) }
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
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ ok: false, message: "Producto no encontrado" });

    // 1. Verificar si tiene stock en algún almacén
    const stockQty = await ProductStock.sum('qty', { where: { product_id: req.params.id } });
    if (parseFloat(stockQty || 0) > 0) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar: el producto tiene existencias en inventario" });
    }

    // 2. Verificar si tiene historial de ventas
    const saleCount = await SaleItem.count({ where: { product_id: req.params.id } });
    if (saleCount > 0) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar: tiene historial de ventas asociadas" });
    }

    // 3. Verificar si tiene historial de compras
    const purchaseCount = await PurchaseItem.count({ where: { product_id: req.params.id } });
    if (purchaseCount > 0) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar: tiene historial de compras asociadas" });
    }

    // 4. Verificar si tiene transferencias
    const transferCount = await StockTransfer.count({ where: { product_id: req.params.id } });
    if (transferCount > 0) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar: tiene historial de transferencias" });
    }

    // Si todo está limpio, borrar imagen y registro
    deleteOldImage(product.image_filename);
    
    // También borrar registros de Stock con qty 0
    await ProductStock.destroy({ where: { product_id: req.params.id } });

    await product.destroy();
    res.json({ ok: true, message: "Producto eliminado exitosamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar producto" });
  }
};

module.exports = { getAll, getOne, create, update, remove };
