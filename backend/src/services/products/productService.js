const path = require("path");
const fs   = require("fs");
const { Product, Category, SaleItem, PurchaseItem, StockTransfer, ProductStock, Sequelize, ProductComboItem, sequelize } = require("../../models");
const Op = Sequelize.Op;

const isSupabase = () => !!process.env.SUPABASE_URL;
const getSupabaseStorage = () => require("../../config/supabase");

function imageUrl(filename) {
  if (!filename) return null;
  if (filename.startsWith("http")) return filename;
  return `/uploads/${filename}`;
}

function calculateComboStockAndCost(comboItems) {
  if (!comboItems?.length) return { stock: 0, cost: 0 };
  let minStock = Infinity;
  let totalCost = 0;
  for (const item of comboItems) {
    if (!item.ingredient) return { stock: 0, cost: 0 };
    const ingCost = parseFloat(item.ingredient.cost_price) || 0;
    const reqQty  = parseFloat(item.quantity) || 1;
    totalCost += ingCost * reqQty;
    if (item.ingredient.is_service) continue; // services don't limit combo stock
    const stockModel = item.ingredient.stocks?.[0];
    const ingStock = stockModel ? parseFloat(stockModel.qty) : parseFloat(item.ingredient.stock || 0);
    const possible = Math.floor(ingStock / reqQty);
    if (possible < minStock) minStock = possible;
  }
  // all ingredients are services → unlimited stock (null)
  return { stock: minStock === Infinity ? null : minStock, cost: totalCost };
}

async function handleImageUpload(file) {
  if (!file) return null;
  if (isSupabase()) {
    const ext      = path.extname(file.originalname).toLowerCase();
    const filename = `product_${Date.now()}${ext}`;
    return getSupabaseStorage().uploadImage(file.buffer, filename, file.mimetype);
  }
  const uploadsDir = path.join(__dirname, "../../../uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const ext      = path.extname(file.originalname).toLowerCase();
  const filename = `product_${Date.now()}${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  return filename;
}

async function handleImageDelete(imageValue) {
  if (!imageValue) return;
  if (isSupabase()) {
    const filename = imageValue.startsWith("http") ? imageValue.split("/").pop() : null;
    if (filename) await getSupabaseStorage().deleteImage(filename);
  }
}

async function getAll({ search, category_id, is_combo, is_service, warehouse_id, limit = 100, offset = 0 }) {
  const where = {};
  if (category_id)             where.category_id = category_id;
  if (is_combo   !== undefined) where.is_combo   = is_combo   === 'true';
  if (is_service !== undefined) where.is_service = is_service === 'true';

  const include = [
    { model: Category, attributes: ['name'], required: false },
    {
      model: ProductComboItem,
      as: 'comboItems',
      include: [{
        model: Product,
        as: 'ingredient',
        attributes: ['id', 'name', 'unit', 'price', 'cost_price', 'stock', 'is_service'],
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
    where, include,
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
    if (prod.stocks?.length > 0) {
      prod.warehouse_stock = parseFloat(prod.stocks[0].qty || 0);
      delete prod.stocks;
    } else if (warehouse_id) {
      prod.warehouse_stock = 0;
    }
    if (prod.is_combo) {
      const stats = calculateComboStockAndCost(prod.comboItems);
      prod.stock = stats.stock;
      prod.cost_price = stats.cost;
      if (warehouse_id !== undefined) prod.warehouse_stock = stats.stock;
    }
    return prod;
  });

  return { data, total: count, limit: parseInt(limit), offset: parseInt(offset) };
}

async function getOne(id) {
  const product = await Product.findByPk(id, {
    include: [
      { model: Category, attributes: ['name'], required: false },
      {
        model: ProductComboItem,
        as: 'comboItems',
        include: [{ model: Product, as: 'ingredient', attributes: ['id', 'name', 'unit', 'price', 'cost_price', 'stock', 'is_service'] }]
      }
    ]
  });
  if (!product) { const e = new Error("Producto no encontrado"); e.status = 404; throw e; }

  const p = product.toJSON();
  p.category_name = p.Category?.name ?? null;
  delete p.Category;
  p.image_url = imageUrl(p.image_filename);
  if (p.is_combo) {
    const stats = calculateComboStockAndCost(p.comboItems);
    p.stock = stats.stock;
    p.cost_price = stats.cost;
  }
  return { data: p };
}

async function createProduct({ body, file, company_id }) {
  const { name, price, category_id, unit, qty_step,
          cost_price, profit_margin, package_size, package_unit, min_stock,
          is_combo, combo_items, is_service, barcode } = body;

  if (!name || price == null) {
    const e = new Error("name y price son requeridos"); e.status = 400; throw e;
  }

  const imageValue  = await handleImageUpload(file);
  const isComboBool = is_combo   === 'true' || is_combo   === true;
  const isServiceBool = is_service === 'true' || is_service === true;

  const t = await sequelize.transaction();
  try {
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
      company_id,
    }, { transaction: t });

    if (isComboBool && combo_items) {
      const parsedItems = typeof combo_items === 'string' ? JSON.parse(combo_items) : combo_items;
      if (Array.isArray(parsedItems) && parsedItems.length > 0) {
        await ProductComboItem.bulkCreate(
          parsedItems.map(i => ({ combo_id: product.id, product_id: i.product_id, quantity: i.quantity, company_id })),
          { transaction: t }
        );
      }
    }

    await t.commit();
    return { data: { ...product.toJSON(), image_url: imageUrl(imageValue) } };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function updateProduct({ id, body, file, company_id }) {
  const { name, price, category_id, unit, qty_step,
          cost_price, profit_margin, package_size, package_unit, min_stock,
          is_combo, combo_items, is_service, barcode } = body;

  const t = await sequelize.transaction();
  try {
    const product = await Product.findByPk(id, { transaction: t });
    if (!product) { const e = new Error("Producto no encontrado"); e.status = 404; throw e; }

    let currentImageValue = product.image_filename;
    if (file) {
      await handleImageDelete(currentImageValue);
      currentImageValue = await handleImageUpload(file);
    } else if (body.remove_image === "true") {
      await handleImageDelete(currentImageValue);
      currentImageValue = null;
    }

    const isComboBool   = is_combo   === 'true' || is_combo   === true  || (is_combo   === undefined ? product.is_combo   : false);
    const isServiceBool = is_service === 'true' || is_service === true  || (is_service === undefined ? product.is_service : false);

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
        await ProductComboItem.bulkCreate(
          parsedItems.map(i => ({ combo_id: product.id, product_id: i.product_id, quantity: i.quantity, company_id })),
          { transaction: t }
        );
      }
    } else if (!isComboBool) {
      await ProductComboItem.destroy({ where: { combo_id: product.id }, transaction: t });
    }

    await t.commit();
    return { data: { ...product.toJSON(), image_url: imageUrl(currentImageValue) } };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function deleteProduct(id) {
  const product = await Product.findByPk(id);
  if (!product) { const e = new Error("Producto no encontrado"); e.status = 404; throw e; }

  const stockQty = await ProductStock.sum('qty', { where: { product_id: id } });
  if (parseFloat(stockQty || 0) > 0) {
    const e = new Error("No se puede eliminar: el producto tiene existencias en inventario"); e.status = 400; throw e;
  }

  const saleCount = await SaleItem.count({ where: { product_id: id } });
  if (saleCount > 0) {
    const e = new Error("No se puede eliminar: tiene historial de ventas asociadas"); e.status = 400; throw e;
  }

  const comboUsageCount = await ProductComboItem.count({ where: { product_id: id } });
  if (comboUsageCount > 0) {
    const e = new Error("No se puede eliminar: es parte de uno o más combos (ingrediente)"); e.status = 400; throw e;
  }

  const purchaseCount = await PurchaseItem.count({ where: { product_id: id } });
  if (purchaseCount > 0) {
    const e = new Error("No se puede eliminar: tiene historial de compras asociadas"); e.status = 400; throw e;
  }

  const transferCount = await StockTransfer.count({ where: { product_id: id } });
  if (transferCount > 0) {
    const e = new Error("No se puede eliminar: tiene historial de transferencias"); e.status = 400; throw e;
  }

  await handleImageDelete(product.image_filename);
  await ProductStock.destroy({ where: { product_id: id } });
  await product.destroy();
  return { message: "Producto eliminado exitosamente" };
}

module.exports = { getAll, getOne, createProduct, updateProduct, deleteProduct };
