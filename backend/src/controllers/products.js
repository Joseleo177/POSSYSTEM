const path = require("path");
const fs   = require("fs");
const { Product, Category, SaleItem, PurchaseItem, StockTransfer, ProductStock, Sequelize, ProductComboItem, sequelize } = require("../models");
const Op = Sequelize.Op;

const isSupabase = () => !!process.env.SUPABASE_URL;
const getSupabaseStorage = () => require("../config/supabase");

// URL pública de una imagen
const imageUrl = (filename) => {
  if (!filename) return null;
  // Si es una URL completa (Supabase), la retorna tal cual
  if (filename.startsWith("http")) return filename;
  // Si es nombre de archivo local, construye la ruta relativa
  return `/uploads/${filename}`;
};

// Helper: Calcular stock virtual y costo de un combo basado en sus ingredientes
const calculateComboStockAndCost = (comboItems) => {
  if (!comboItems || comboItems.length === 0) return { stock: 0, cost: 0 };
  let minStock = Infinity;
  let totalCost = 0;
  for (const item of comboItems) {
    if (!item.ingredient) return { stock: 0, cost: 0 };

    const stockModel = item.ingredient.stocks && item.ingredient.stocks[0];
    const ingStock = stockModel ? parseFloat(stockModel.qty) : parseFloat(item.ingredient.stock || 0);

    const ingCost = parseFloat(item.ingredient.cost_price) || 0;
    const reqQty = parseFloat(item.quantity) || 1;

    totalCost += ingCost * reqQty;

    const possible = Math.floor(ingStock / reqQty);
    if (possible < minStock) minStock = possible;
  }
  return {
    stock: minStock === Infinity ? 0 : minStock,
    cost: totalCost
  };
};

// Sube imagen: a Supabase Storage o guarda en disco local
async function handleImageUpload(file) {
  if (!file) return null;

  if (isSupabase()) {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `product_${Date.now()}${ext}`;
    const url = await getSupabaseStorage().uploadImage(file.buffer, filename, file.mimetype);
    return url;
  } else {
    // Modo Local: Guardar en disco manualmente ya que multer usa memoryStorage
    const uploadsDir = path.join(__dirname, "../../uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `product_${Date.now()}${ext}`;
    const p = path.join(uploadsDir, filename);
    fs.writeFileSync(p, file.buffer);
    
    return filename;
  }
}

// Elimina imagen anterior
async function handleImageDelete(imageValue) {
  if (!imageValue) return;

  if (isSupabase()) {
    const filename = imageValue.startsWith("http") ? imageValue.split("/").pop() : null;
    if (filename) await getSupabaseStorage().deleteImage(filename);
  }
}

// GET /api/products
const getAll = async (req, res) => {
  try {
    const { search, category_id, is_combo, is_service, warehouse_id, limit = 100, offset = 0 } = req.query;
    const where = {};

    if (category_id) where.category_id = category_id;
    if (is_combo !== undefined) where.is_combo = is_combo === 'true';
    if (is_service !== undefined) where.is_service = is_service === 'true';

    const include = [
      { model: Category, attributes: ['name'], required: false },
      {
        model: ProductComboItem,
        as: 'comboItems',
        include: [{
          model: Product,
          as: 'ingredient',
          attributes: ['id', 'name', 'unit', 'price', 'cost_price', 'stock'],
          include: warehouse_id ? [{
            model: ProductStock,
            as: 'stocks',
            where: { warehouse_id: parseInt(warehouse_id) },
            required: false,
            attributes: ['qty']
          }] : []
        }]
      }
    ];

    if (warehouse_id) {
      include.push({
        model: ProductStock,
        as: 'stocks',
        where: { warehouse_id: parseInt(warehouse_id) },
        required: false,
        attributes: ['qty']
      });
    }

    if (search) {
      const categories = await Category.findAll({
        where: { name: { [Op.iLike]: `%${search}%` } },
        attributes: ['id']
      });
      const catIds = categories.map(c => c.id);

      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        ...(catIds.length > 0 ? [{ category_id: { [Op.in]: catIds } }] : [])
      ];
    }

    const { count, rows } = await Product.findAndCountAll({
      where,
      include,
      order: [['name', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true,
    });

    const data = rows.map(p => {
      const prod = p.toJSON();
      prod.category_name = prod.Category?.name ?? null;
      delete prod.Category;
      prod.image_url = imageUrl(prod.image_filename);

      if (prod.stocks && prod.stocks.length > 0) {
        prod.warehouse_stock = parseFloat(prod.stocks[0].qty || 0);
        delete prod.stocks;
      } else if (warehouse_id) {
        prod.warehouse_stock = 0;
      }

      if (prod.is_combo) {
        const stats = calculateComboStockAndCost(prod.comboItems);
        prod.stock = stats.stock;
        prod.cost_price = stats.cost;
      }
      return prod;
    });

    res.json({ ok: true, data, total: count, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener productos" });
  }
};

// GET /api/products/:id
const getOne = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [
        { model: Category, attributes: ['name'], required: false },
        {
          model: ProductComboItem,
          as: 'comboItems',
          include: [{ model: Product, as: 'ingredient', attributes: ['id', 'name', 'unit', 'price', 'cost_price', 'stock'] }]
        }
      ]
    });
    if (!product) return res.status(404).json({ ok: false, message: "Producto no encontrado" });

    const p = product.toJSON();
    p.category_name = p.Category?.name ?? null;
    delete p.Category;
    p.image_url = imageUrl(p.image_filename);
    if (p.is_combo) {
      const stats = calculateComboStockAndCost(p.comboItems);
      p.stock = stats.stock;
      p.cost_price = stats.cost;
    }

    res.json({ ok: true, data: p });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener producto" });
  }
};

// POST /api/products
const create = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const company_id = req.employee?.company_id ?? null;
    const { name, price, stock, category_id, unit, qty_step,
            cost_price, profit_margin, package_size, package_unit, min_stock, is_combo, combo_items, is_service, barcode } = req.body;

    if (!name || price == null) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: "name y price son requeridos" });
    }

    const imageValue = await handleImageUpload(req.file);
    const isComboBool = is_combo === 'true' || is_combo === true;
    const isServiceBool = is_service === 'true' || is_service === true;

    const product = await Product.create({
      name, price,
      stock: 0,
      category_id: category_id || null,
      image_filename: imageValue,
      unit: unit || "unidad",
      qty_step: qty_step || 1,
      cost_price: isComboBool ? null : (cost_price || null),
      profit_margin: profit_margin || null,
      package_size: package_size || null,
      package_unit: package_unit || null,
      min_stock: parseFloat(min_stock) || 0,
      is_combo: isComboBool,
      is_service: isServiceBool,
      barcode: barcode || null,
    }, { transaction: t });

    if (isComboBool && combo_items) {
      const parsedItems = typeof combo_items === 'string' ? JSON.parse(combo_items) : combo_items;
      if (Array.isArray(parsedItems) && parsedItems.length > 0) {
        const itemsToCreate = parsedItems.map(i => ({
          combo_id: product.id,
          product_id: i.product_id,
          quantity: i.quantity,
          company_id,
        }));
        await ProductComboItem.bulkCreate(itemsToCreate, { transaction: t });
      }
    }

    await t.commit();
    res.status(201).json({
      ok: true,
      data: { ...product.toJSON(), image_url: imageUrl(imageValue) }
    });
  } catch (err) {
    await t.rollback();
    console.error("ERROR create product:", err);
    res.status(500).json({ ok: false, message: err.message || "Error al crear producto" });
  }
};

// PUT /api/products/:id
const update = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const company_id = req.employee?.company_id ?? null;
    const { name, price, category_id, unit, qty_step,
            cost_price, profit_margin, package_size, package_unit, min_stock, is_combo, combo_items, is_service, barcode } = req.body;

    const product = await Product.findByPk(req.params.id, { transaction: t });
    if (!product) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: "Producto no encontrado" });
    }

    let currentImageValue = product.image_filename;

    if (req.file) {
      await handleImageDelete(currentImageValue);
      currentImageValue = await handleImageUpload(req.file);
    } else if (req.body.remove_image === "true") {
      await handleImageDelete(currentImageValue);
      currentImageValue = null;
    }

    const isComboBool = is_combo === 'true' || is_combo === true || (is_combo === undefined ? product.is_combo : false);
    const isServiceBool = is_service === 'true' || is_service === true || (is_service === undefined ? product.is_service : false);

    await product.update({
      name, price,
      category_id: category_id || null,
      image_filename: currentImageValue,
      unit: unit || "unidad",
      qty_step: qty_step || 1,
      stock: (isComboBool || isServiceBool) ? 0 : product.stock,
      cost_price: isComboBool ? null : (cost_price || null),
      profit_margin: profit_margin || null,
      package_size: package_size || null,
      package_unit: package_unit || null,
      min_stock: parseFloat(min_stock) || 0,
      is_combo: isComboBool,
      is_service: isServiceBool,
      barcode: barcode || null,
    }, { transaction: t });

    if (isComboBool && combo_items !== undefined) {
      await ProductComboItem.destroy({ where: { combo_id: product.id }, transaction: t });

      const parsedItems = typeof combo_items === 'string' ? (combo_items ? JSON.parse(combo_items) : []) : combo_items;
      if (Array.isArray(parsedItems) && parsedItems.length > 0) {
        const itemsToCreate = parsedItems.map(i => ({
          combo_id: product.id,
          product_id: i.product_id,
          quantity: i.quantity,
          company_id,
        }));
        await ProductComboItem.bulkCreate(itemsToCreate, { transaction: t });
      }
    } else if (!isComboBool) {
      await ProductComboItem.destroy({ where: { combo_id: product.id }, transaction: t });
    }

    await t.commit();
    res.json({
      ok: true,
      data: { ...product.toJSON(), image_url: imageUrl(currentImageValue) }
    });
  } catch (err) {
    await t.rollback();
    console.error("ERROR update product:", err);
    res.status(500).json({ ok: false, message: err.message || "Error al actualizar producto" });
  }
};

// DELETE /api/products/:id
const remove = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ ok: false, message: "Producto no encontrado" });

    const stockQty = await ProductStock.sum('qty', { where: { product_id: req.params.id } });
    if (parseFloat(stockQty || 0) > 0) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar: el producto tiene existencias en inventario" });
    }

    const saleCount = await SaleItem.count({ where: { product_id: req.params.id } });
    if (saleCount > 0) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar: tiene historial de ventas asociadas" });
    }

    const comboUsageCount = await ProductComboItem.count({ where: { product_id: req.params.id } });
    if (comboUsageCount > 0) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar: es parte de uno o más combos (ingrediente)" });
    }

    const purchaseCount = await PurchaseItem.count({ where: { product_id: req.params.id } });
    if (purchaseCount > 0) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar: tiene historial de compras asociadas" });
    }

    const transferCount = await StockTransfer.count({ where: { product_id: req.params.id } });
    if (transferCount > 0) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar: tiene historial de transferencias" });
    }

    await handleImageDelete(product.image_filename);
    await ProductStock.destroy({ where: { product_id: req.params.id } });
    await product.destroy();
    res.json({ ok: true, message: "Producto eliminado exitosamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar producto" });
  }
};

module.exports = { getAll, getOne, create, update, remove };
