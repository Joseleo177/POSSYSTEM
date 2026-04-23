const { Product, ProductStock, Sequelize, sequelize } = require("../../models");

function buildTcp(req) {
  const company_id = req.employee?.company_id ?? null;
  const isSuperuser = !!req.is_superuser;
  return (!isSuperuser && company_id) ? ` AND p.company_id = ${parseInt(company_id)}` : '';
}

async function getStock(req) {
  const warehouseId = parseInt(req.params.id);
  const { search, limit = 50, offset = 0 } = req.query;
  const tcp = buildTcp(req);

  const replacements = { wid: warehouseId, limit: parseInt(limit), offset: parseInt(offset) };
  let searchFilter = "";
  if (search?.trim()) {
    searchFilter = "AND (p.name ILIKE :search OR c.name ILIKE :search OR p.barcode ILIKE :search)";
    replacements.search = `%${search.trim()}%`;
  }

  const countReplacements = { wid: warehouseId };
  if (replacements.search) countReplacements.search = replacements.search;

  const countRes = await sequelize.query(`
    SELECT count(*)::int as count
    FROM product_stock ps
    JOIN products p ON p.id = ps.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ps.warehouse_id = :wid ${tcp}
    ${searchFilter}
  `, { replacements: countReplacements, type: Sequelize.QueryTypes.SELECT });

  const count = countRes[0]?.count || 0;

  const productsRaw = await sequelize.query(`
    SELECT
      p.id AS product_id, p.name AS product_name, p.price, p.unit, p.image_filename,
      p.cost_price, p.is_combo, p.barcode,
      c.name AS category_name,
      ps.qty
    FROM product_stock ps
    JOIN products p ON p.id = ps.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ps.warehouse_id = :wid ${tcp}
    ${searchFilter}
    ORDER BY c.name ASC NULLS LAST, p.name ASC
    LIMIT :limit OFFSET :offset
  `, { replacements, type: Sequelize.QueryTypes.SELECT });

  if (!productsRaw?.length) return { data: [], total: 0 };

  const comboIds = productsRaw.filter(p => p.is_combo).map(p => p.product_id);
  const ingredientStockMap = {};
  const comboCostMap = {};

  if (comboIds.length > 0) {
    const comboData = await sequelize.query(`
      SELECT
        pci.combo_id,
        pci.quantity,
        COALESCE(ps2.qty, 0) AS ingredient_stock,
        p.cost_price AS ingredient_cost
      FROM product_combo_items pci
      JOIN products p ON p.id = pci.product_id
      LEFT JOIN product_stock ps2
        ON ps2.product_id = pci.product_id AND ps2.warehouse_id = :wid
      WHERE pci.combo_id IN (${comboIds.join(',')}) ${tcp} AND pci.company_id = p.company_id
    `, { replacements: { wid: warehouseId }, type: Sequelize.QueryTypes.SELECT });

    const byCombo = {};
    comboData.forEach(row => {
      if (!byCombo[row.combo_id]) byCombo[row.combo_id] = [];
      byCombo[row.combo_id].push(row);
    });

    comboIds.forEach(cid => {
      const rows = byCombo[cid] || [];
      if (!rows.length) { ingredientStockMap[cid] = 0; comboCostMap[cid] = 0; return; }
      let min = Infinity;
      let totalCost = 0;
      for (const r of rows) {
        const ingQty = parseFloat(r.quantity) || 1;
        const possible = Math.floor(parseFloat(r.ingredient_stock) / ingQty);
        if (possible < min) min = possible;
        totalCost += parseFloat(r.ingredient_cost || 0) * ingQty;
      }
      ingredientStockMap[cid] = min === Infinity ? 0 : min;
      comboCostMap[cid] = totalCost;
    });
  }

  const data = productsRaw.map(p => ({
    product_id:    p.product_id,
    product_name:  p.product_name,
    is_combo:      p.is_combo,
    barcode:       p.barcode,
    qty:           p.is_combo ? (ingredientStockMap[p.product_id] ?? 0) : parseFloat(p.qty) || 0,
    unit:          p.unit,
    price:         parseFloat(p.price || 0),
    cost_price:    p.is_combo ? (comboCostMap[p.product_id] ?? 0) : parseFloat(p.cost_price || 0),
    category_name: p.category_name,
    image_url:     p.image_filename ? (p.image_filename.startsWith('http') ? p.image_filename : `/uploads/${p.image_filename}`) : null
  }));

  return { data, total: count };
}

async function getProducts(req) {
  const { search, category, limit = 30, offset = 0 } = req.query;
  const warehouseId = parseInt(req.params.id);
  const tcp = buildTcp(req);

  const filters = [];
  const replacements = { wid: warehouseId, limit: parseInt(limit), offset: parseInt(offset) };
  if (search?.trim()) {
    filters.push(`(p.name ILIKE :search OR c.name ILIKE :search OR p.barcode ILIKE :search)`);
    replacements.search = `%${search.trim()}%`;
  }
  if (category && category !== 'all') {
    filters.push(`c.name = :category`);
    replacements.category = category;
  }
  const whereExtra = filters.length ? `AND ` + filters.join(' AND ') : '';
  const countJoin = filters.length ? `LEFT JOIN categories c ON c.id = p.category_id` : '';

  const [{ count }] = await sequelize.query(`
    SELECT COUNT(*) AS count
    FROM products p
    LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid
    ${countJoin}
    WHERE (p.is_service = true OR p.is_combo = true OR ps.product_id IS NOT NULL) ${tcp}
    ${whereExtra}
  `, { replacements, type: Sequelize.QueryTypes.SELECT });

  if (parseInt(count) === 0) return { data: [], total: 0 };

  const productsRaw = await sequelize.query(`
    SELECT
      p.id, p.name, p.price, p.unit, p.qty_step, p.image_filename,
      p.cost_price, p.is_combo, p.is_service, p.min_stock, p.barcode,
      c.name AS category_name, c.id AS category_id,
      ps.qty,
      COALESCE(si_agg.total_sold, 0) AS total_sold
    FROM products p
    LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN (
      SELECT product_id, SUM(quantity) AS total_sold
      FROM sale_items
      GROUP BY product_id
    ) si_agg ON si_agg.product_id = p.id
    WHERE (p.is_service = true OR p.is_combo = true OR ps.product_id IS NOT NULL) ${tcp}
    ${whereExtra}
    ORDER BY total_sold DESC, p.name ASC
    LIMIT :limit OFFSET :offset
  `, { replacements, type: Sequelize.QueryTypes.SELECT });

  if (!productsRaw.length) return { data: [] };

  const comboIds = productsRaw.filter(p => p.is_combo).map(p => p.id);
  const ingredientStockMap = {};
  const comboCostMap = {};
  const comboItemsMap = {};

  if (comboIds.length > 0) {
    const comboData = await sequelize.query(`
      SELECT
        pci.combo_id,
        pci.product_id AS ingredient_id,
        pci.quantity,
        COALESCE(ps2.qty, 0) AS ingredient_stock,
        p.cost_price AS ingredient_cost,
        p.is_service AS ingredient_is_service
      FROM product_combo_items pci
      JOIN products p ON p.id = pci.product_id
      LEFT JOIN product_stock ps2
        ON ps2.product_id = pci.product_id AND ps2.warehouse_id = :wid
      WHERE pci.combo_id IN (:cids) ${tcp} AND pci.company_id = p.company_id
    `, { replacements: { wid: warehouseId, cids: comboIds }, type: Sequelize.QueryTypes.SELECT });

    const byCombo = {};
    comboData.forEach(row => {
      if (!byCombo[row.combo_id]) byCombo[row.combo_id] = [];
      byCombo[row.combo_id].push(row);
    });

    comboIds.forEach(cid => {
      const rows = byCombo[cid] || [];
      comboItemsMap[cid] = rows.map(r => ({
        ingredient_id:       r.ingredient_id,
        quantity:            parseFloat(r.quantity) || 1,
        ingredient_stock:    parseFloat(r.ingredient_stock) || 0,
        ingredient_is_service: !!r.ingredient_is_service,
      }));

      if (!rows.length) { ingredientStockMap[cid] = 0; comboCostMap[cid] = 0; return; }
      let min = Infinity;
      let totalCost = 0;
      for (const r of rows) {
        const ingQty = parseFloat(r.quantity) || 1;
        totalCost += parseFloat(r.ingredient_cost || 0) * ingQty;
        if (r.ingredient_is_service) continue;
        const possible = Math.floor(parseFloat(r.ingredient_stock) / ingQty);
        if (possible < min) min = possible;
      }
      ingredientStockMap[cid] = min === Infinity ? Infinity : min;
      comboCostMap[cid] = totalCost;
    });
  }

  const data = productsRaw.map(p => ({
    id:           p.id,
    name:         p.name,
    price:        parseFloat(p.price),
    unit:         p.unit,
    qty_step:     parseFloat(p.qty_step || 1),
    barcode:      p.barcode,
    image_filename: p.image_filename,
    cost_price:   p.is_combo ? (comboCostMap[p.id] ?? 0) : parseFloat(p.cost_price || 0),
    stock:        p.is_combo ? (ingredientStockMap[p.id] === Infinity ? null : (ingredientStockMap[p.id] ?? 0)) : (parseFloat(p.qty) || 0),
    sales:        parseFloat(p.total_sold),
    category_name: p.category_name,
    category_id:  p.category_id,
    is_combo:     p.is_combo,
    is_service:   p.is_service,
    combo_items:  p.is_combo ? (comboItemsMap[p.id] || []) : [],
    image_url:    p.image_filename ? (p.image_filename.startsWith('http') ? p.image_filename : `/uploads/${p.image_filename}`) : null
  }));

  return { data, total: parseInt(count) };
}

async function addStock(req) {
  const { product_id, qty } = req.body;
  const warehouseId = parseInt(req.params.id);
  if (!product_id || qty == null) {
    const e = new Error("product_id y qty son requeridos"); e.status = 400; throw e;
  }
  const parsedQty = parseFloat(qty);
  if (isNaN(parsedQty) || parsedQty === 0) {
    const e = new Error("La cantidad no puede ser 0"); e.status = 400; throw e;
  }

  const transaction = await sequelize.transaction();
  try {
    const product = await Product.findByPk(product_id, { transaction, lock: true });
    if (!product) { const e = new Error("Producto no encontrado"); e.status = 404; throw e; }

    const [stockEntry] = await ProductStock.findOrCreate({
      where: { warehouse_id: warehouseId, product_id },
      defaults: { qty: 0 },
      transaction,
      lock: true
    });

    if (parsedQty < 0) {
      const currentQty = parseFloat(stockEntry.qty || 0);
      if (currentQty + parsedQty < 0) {
        const e = new Error(`Stock insuficiente. Disponible: ${currentQty}`); e.status = 400; throw e;
      }
    }

    await stockEntry.increment('qty', { by: parsedQty, transaction });

    const totalStock = await ProductStock.sum('qty', { where: { product_id }, transaction });
    await product.update({ stock: totalStock }, { transaction });

    await transaction.commit();
    const action = parsedQty > 0 ? `+${parsedQty}` : `${parsedQty}`;
    return { message: `${product.name}: ${action} unidades ajustadas` };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function setStock(req) {
  const warehouseId = parseInt(req.params.id);
  const productId = parseInt(req.params.productId);
  const { qty } = req.body;
  const parsedQty = parseFloat(qty);
  if (isNaN(parsedQty) || parsedQty < 0) {
    const e = new Error("La cantidad es inválida"); e.status = 400; throw e;
  }

  const transaction = await sequelize.transaction();
  try {
    const product = await Product.findByPk(productId, { transaction, lock: true });
    if (!product) { const e = new Error("Producto no encontrado"); e.status = 404; throw e; }
    if (product.is_combo) { const e = new Error("No se puede editar directamente el stock de un combo (es calculado)."); e.status = 400; throw e; }

    const stockEntry = await ProductStock.findOne({ where: { warehouse_id: warehouseId, product_id: productId }, transaction, lock: true });
    if (!stockEntry) { const e = new Error("El producto no está asignado a este almacén"); e.status = 404; throw e; }

    await stockEntry.update({ qty: parsedQty }, { transaction });

    const totalStock = await ProductStock.sum('qty', { where: { product_id: productId }, transaction });
    await product.update({ stock: totalStock || 0 }, { transaction });

    await transaction.commit();
    return { message: `Stock actualizado a ${parsedQty}` };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function removeStock(req) {
  const warehouseId = parseInt(req.params.id);
  const productId = parseInt(req.params.productId);

  const transaction = await sequelize.transaction();
  try {
    const stockEntry = await ProductStock.findOne({ where: { warehouse_id: warehouseId, product_id: productId } });
    if (!stockEntry) { const e = new Error("El producto no está en este almacén"); e.status = 404; throw e; }

    await stockEntry.destroy({ transaction });

    const totalStock = await ProductStock.sum('qty', { where: { product_id: productId }, transaction });
    await Product.update({ stock: totalStock || 0 }, { where: { id: productId }, transaction });

    await transaction.commit();
    return { message: "Producto retirado del almacén" };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = { getStock, getProducts, addStock, setStock, removeStock };
