const {
  Warehouse, Product, Category, ProductStock, EmployeeWarehouse, StockTransfer, Employee, Sale, Purchase, Sequelize, sequelize
} = require("../models");
const { Op } = Sequelize;

// GET /api/warehouses
const getAll = async (req, res) => {
  try {
    const warehouses = await Warehouse.findAll({
      attributes: [
        'id', 'name', 'description', 'active', 'sort_order', 'created_at',
        [Sequelize.fn('COUNT', Sequelize.literal('DISTINCT "ProductStocks"."product_id"')), 'product_count'],
        [Sequelize.fn('COALESCE', Sequelize.fn('SUM', Sequelize.col('ProductStocks.qty')), 0), 'total_stock']
      ],
      include: [
        { model: ProductStock, attributes: [], required: false },
        { model: EmployeeWarehouse, attributes: ['employee_id'], required: false }
      ],
      group: ['Warehouse.id', 'EmployeeWarehouses.employee_id', 'EmployeeWarehouses.warehouse_id'],
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
      subQuery: false
    });

    // Procesar para agrupar empleados asignados (Sequelize agrupa por cada fila de la asociación en el group by)
    const processed = [];
    const map = new Map();

    warehouses.forEach(w => {
      const id = w.id;
      if (!map.has(id)) {
        const item = w.toJSON();
        item.assigned_employees = [];
        if (w.EmployeeWarehouses && w.EmployeeWarehouses.length) {
          item.assigned_employees = w.EmployeeWarehouses.map(ew => ({ employee_id: ew.employee_id }));
        }
        item.product_count = parseInt(item.product_count || 0);
        item.total_stock = parseFloat(item.total_stock || 0);
        delete item.EmployeeWarehouses;
        map.set(id, item);
        processed.push(item);
      } else {
        // Si ya existe (por múltiples empleados), añadir el empleado si no está
        const item = map.get(id);
        if (w.EmployeeWarehouses && w.EmployeeWarehouses.length) {
          w.EmployeeWarehouses.forEach(ew => {
            if (!item.assigned_employees.find(e => e.employee_id === ew.employee_id)) {
              item.assigned_employees.push({ employee_id: ew.employee_id });
            }
          });
        }
      }
    });

    res.json({ ok: true, data: processed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener almacenes" });
  }
};

// GET /api/warehouses/:id/stock
const getStock = async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.id);

    // 1. Obtener todos los productos y stock del almacén
    const productsRaw = await sequelize.query(`
      SELECT
        p.id AS product_id, p.name AS product_name, p.price, p.unit, p.image_filename,
        p.cost_price, p.is_combo,
        c.name AS category_name,
        ps.qty
      FROM product_stock ps
      JOIN products p ON p.id = ps.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ps.warehouse_id = :wid
      ORDER BY c.name ASC NULLS LAST, p.name ASC
    `, { replacements: { wid: warehouseId }, type: Sequelize.QueryTypes.SELECT });

    if (productsRaw.length === 0) return res.json({ ok: true, data: [] });

    // 2. Calcular stock virtual para combos
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
        WHERE pci.combo_id IN (:cids)
      `, { replacements: { wid: warehouseId, cids: comboIds }, type: Sequelize.QueryTypes.SELECT });

      const byCombo = {};
      comboData.forEach(row => {
        if (!byCombo[row.combo_id]) byCombo[row.combo_id] = [];
        byCombo[row.combo_id].push(row);
      });

      comboIds.forEach(cid => {
        const rows = byCombo[cid] || [];
        if (rows.length === 0) { 
          ingredientStockMap[cid] = 0; 
          comboCostMap[cid] = 0;
          return; 
        }
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
      product_id: p.product_id,
      product_name: p.product_name,
      is_combo: p.is_combo,
      qty: p.is_combo ? (ingredientStockMap[p.product_id] ?? 0) : parseFloat(p.qty) || 0,
      unit: p.unit,
      price: parseFloat(p.price || 0),
      cost_price: p.is_combo ? (comboCostMap[p.product_id] ?? 0) : parseFloat(p.cost_price || 0),
      category_name: p.category_name,
      image_url: p.image_filename ? `/uploads/${p.image_filename}` : null
    }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener stock del almacén" });
  }
};

// GET /api/warehouses/employee/:employeeId
const getByEmployee = async (req, res) => {
  try {
    const warehouses = await Warehouse.findAll({
      include: [{
        model: EmployeeWarehouse,
        where: { employee_id: req.params.employeeId },
        attributes: []
      }],
      where: { active: true },
      order: [['sort_order', 'ASC'], ['name', 'ASC']]
    });
    res.json({ ok: true, data: warehouses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener almacenes del empleado" });
  }
};

// POST /api/warehouses
const create = async (req, res) => {
  try {
    const { name, description, sort_order = 0 } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const warehouse = await Warehouse.create({ name: name.trim(), description: description || null, sort_order });
    res.status(201).json({ ok: true, data: warehouse });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: "Ya existe un almacén con ese nombre" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear almacén" });
  }
};

// PUT /api/warehouses/:id
const update = async (req, res) => {
  try {
    const { name, description, active, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const warehouse = await Warehouse.findByPk(req.params.id);
    if (!warehouse) return res.status(404).json({ ok: false, message: "Almacén no encontrado" });

    await warehouse.update({ name: name.trim(), description: description || null, active: active ?? true, sort_order: sort_order ?? 0 });
    res.json({ ok: true, data: warehouse });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: "Ya existe un almacén con ese nombre" });
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar almacén" });
  }
};

// DELETE /api/warehouses/:id
const remove = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const warehouseId = req.params.id;
    const warehouse = await Warehouse.findByPk(warehouseId);
    if (!warehouse) return res.status(404).json({ ok: false, message: "Almacén no encontrado" });

    // 1. Verificar stock real (> 0)
    const total = await ProductStock.sum('qty', { where: { warehouse_id: warehouseId } });
    if (parseFloat(total || 0) > 0) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar un almacén con stock. Transfiere o ajusta el stock primero." });
    }

    // 2. Verificar historial de movimientos CRÍTICOS (Ventas y Compras)
    const saleCount = await Sale.count({ where: { warehouse_id: warehouseId } });
    const purchaseCount = await Purchase.count({ where: { warehouse_id: warehouseId } });
    
    if (saleCount > 0 || purchaseCount > 0) {
      return res.status(400).json({
        ok: false,
        message: "No se puede eliminar físicamente el almacén porque tiene historial de VENTAS o COMPRAS. Intenta desactivarlo en su lugar."
      });
    }

    // 3. Limpiar tablas asociadas (Transferencias, Stock y Empleados)
    // Borramos transferencias donde el almacén participe
    await StockTransfer.destroy({
      where: {
        [Op.or]: [{ from_warehouse_id: warehouseId }, { to_warehouse_id: warehouseId }]
      },
      transaction
    });
    await ProductStock.destroy({ where: { warehouse_id: warehouseId }, transaction });
    await EmployeeWarehouse.destroy({ where: { warehouse_id: warehouseId }, transaction });

    // 4. Eliminar el almacén
    await warehouse.destroy({ transaction });

    await transaction.commit();
    res.json({ ok: true, message: "Almacén eliminado exitosamente" });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar almacén" });
  }
};

// POST /api/warehouses/transfer
const transfer = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { from_warehouse_id, to_warehouse_id, product_id, qty, note } = req.body;
    if (!from_warehouse_id || !to_warehouse_id || !product_id || !qty) throw new Error("Origen, destino, producto y cantidad son requeridos");
    if (parseInt(from_warehouse_id) === parseInt(to_warehouse_id)) throw new Error("El almacén origen y destino deben ser distintos");

    const parsedQty = parseFloat(qty);
    if (isNaN(parsedQty) || parsedQty <= 0) throw new Error("La cantidad debe ser mayor a 0");

    const product = await Product.findByPk(product_id, { transaction, lock: true });
    if (!product) throw new Error("Producto no encontrado");

    if (from_warehouse_id) {
      const fromStock = await ProductStock.findOne({
        where: { warehouse_id: from_warehouse_id, product_id },
        transaction,
        lock: true
      });
      const available = parseFloat(fromStock?.qty || 0);
      if (available < parsedQty) throw new Error(`Stock insuficiente en el almacén origen. Disponible: ${available}`);
      await fromStock.decrement('qty', { by: parsedQty, transaction });
    }

    const [toStock] = await ProductStock.findOrCreate({
      where: { warehouse_id: to_warehouse_id, product_id },
      defaults: { qty: 0 },
      transaction,
      lock: true
    });
    await toStock.increment('qty', { by: parsedQty, transaction });

    const transferRow = await StockTransfer.create({
      from_warehouse_id: from_warehouse_id || null,
      to_warehouse_id,
      product_id,
      product_name: product.name,
      qty: parsedQty,
      note: note || null,
      employee_id: req.employee?.id || null
    }, { transaction });

    // Sincronizar stock total
    const totalStock = await ProductStock.sum('qty', { where: { product_id }, transaction });
    await product.update({ stock: totalStock }, { transaction });

    await transaction.commit();
    res.status(201).json({ ok: true, data: transferRow });
  } catch (err) {
    if (transaction) await transaction.rollback();
    const status = /insuficiente|no encontrado/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

// GET /api/warehouses/transfers
const getTransfers = async (req, res) => {
  try {
    const { warehouse_id, product_id, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (warehouse_id) {
      where[Op.or] = [
        { from_warehouse_id: warehouse_id },
        { to_warehouse_id: warehouse_id }
      ];
    }
    if (product_id) where.product_id = product_id;

    const { count, rows: transfers } = await StockTransfer.findAndCountAll({
      where,
      include: [
        { model: Warehouse, as: 'FromWarehouse', attributes: ['name'], required: false },
        { model: Warehouse, as: 'ToWarehouse', attributes: ['name'], required: false },
        { model: Employee, attributes: ['full_name'], required: false }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const data = transfers.map(t => {
      const item = t.toJSON();
      item.from_warehouse_name = item.FromWarehouse?.name ?? null;
      item.to_warehouse_name = item.ToWarehouse?.name ?? null;
      item.employee_name = item.Employee?.full_name ?? null;
      delete item.FromWarehouse;
      delete item.ToWarehouse;
      delete item.Employee;
      return item;
    });

    res.json({ ok: true, data, total: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener transferencias" });
  }
};

// PUT /api/warehouses/:id/employees
const assignEmployees = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { employee_ids = [] } = req.body;
    const warehouseId = req.params.id;

    await EmployeeWarehouse.destroy({ where: { warehouse_id: warehouseId }, transaction });

    for (const empId of employee_ids) {
      await EmployeeWarehouse.create({ employee_id: empId, warehouse_id: warehouseId }, { transaction });
    }

    await transaction.commit();
    res.json({ ok: true, message: "Empleados asignados correctamente" });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al asignar empleados" });
  }
};

// POST /api/warehouses/:id/stock
const addStock = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { product_id, qty } = req.body;
    const warehouseId = parseInt(req.params.id);
    if (!product_id || qty == null) throw new Error("product_id y qty son requeridos");

    const parsedQty = parseFloat(qty);
    if (isNaN(parsedQty) || parsedQty < 0) throw new Error("La cantidad debe ser mayor o igual a 0");

    const product = await Product.findByPk(product_id, { transaction, lock: true });
    if (!product) throw new Error("Producto no encontrado");

    const [stockEntry] = await ProductStock.findOrCreate({
      where: { warehouse_id: warehouseId, product_id },
      defaults: { qty: 0 },
      transaction,
      lock: true
    });

    await stockEntry.increment('qty', { by: parsedQty, transaction });

    // Sincronizar stock total
    const totalStock = await ProductStock.sum('qty', { where: { product_id }, transaction });
    await product.update({ stock: totalStock }, { transaction });

    await transaction.commit();
    res.json({ ok: true, message: `${product.name}: +${parsedQty} unidades sumadas al almacén` });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "Error al agregar producto al almacén" });
  }
};

// PUT /api/warehouses/:id/stock/:productId
const setStock = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const warehouseId = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);
    const { qty } = req.body;

    const parsedQty = parseFloat(qty);
    if (isNaN(parsedQty) || parsedQty < 0) throw new Error("La cantidad es inválida");

    const product = await Product.findByPk(productId, { transaction, lock: true });
    if (!product) throw new Error("Producto no encontrado");

    if (product.is_combo) throw new Error("No se puede editar directamente el stock de un combo (es calculado).");

    const stockEntry = await ProductStock.findOne({ where: { warehouse_id: warehouseId, product_id: productId }, transaction, lock: true });
    if (!stockEntry) throw new Error("El producto no está asignado a este almacén");

    await stockEntry.update({ qty: parsedQty }, { transaction });

    // Sincronizar stock total
    const totalStock = await ProductStock.sum('qty', { where: { product_id: productId }, transaction });
    await product.update({ stock: totalStock || 0 }, { transaction });

    await transaction.commit();
    res.json({ ok: true, message: `Stock actualizado a ${parsedQty}` });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "Error al actualizar stock" });
  }
};

// DELETE /api/warehouses/:id/stock/:productId
const removeStock = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const warehouseId = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);

    const stockEntry = await ProductStock.findOne({ where: { warehouse_id: warehouseId, product_id: productId } });
    if (!stockEntry) throw new Error("El producto no está en este almacén");

    await stockEntry.destroy({ transaction });

    // Sincronizar stock total
    const totalStock = await ProductStock.sum('qty', { where: { product_id: productId }, transaction });
    await Product.update({ stock: totalStock || 0 }, { where: { id: productId }, transaction });

    await transaction.commit();
    res.json({ ok: true, message: "Producto retirado del almacén" });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "Error al retirar producto" });
  }
};

// Helper: Calcular stock de un combo basado en sus ingredientes en este almacén
const calculateWarehouseComboStock = (comboItems) => {
  if (!comboItems || comboItems.length === 0) return 0;
  let minStock = Infinity;
  for (const item of comboItems) {
    if (!item.ingredient) return 0;
    // Buscamos el stock local del ingrediente (que viene cargado en ProductStocks)
    const ingStocks = item.ingredient.ProductStocks || [];
    const localStock = ingStocks.length > 0 ? parseFloat(ingStocks[0].qty) : 0;
    
    const reqQty = parseFloat(item.quantity) || 1;
    const possible = Math.floor(localStock / reqQty);
    if (possible < minStock) minStock = possible;
  }
  return minStock === Infinity ? 0 : minStock;
};

// GET /api/warehouses/:id/products
const getProducts = async (req, res) => {
  try {
    const { search } = req.query;
    const warehouseId = parseInt(req.params.id);

    // Construir filtro de búsqueda
    let searchFilter = '';
    const replacements = { wid: warehouseId };
    if (search && search.trim()) {
      searchFilter = `AND (p.name ILIKE :search OR c.name ILIKE :search)`;
      replacements.search = `%${search.trim()}%`;
    }

    // 1. Traer todos los productos del almacén con su stock y datos básicos
    const productsRaw = await sequelize.query(`
      SELECT
        p.id, p.name, p.price, p.unit, p.qty_step, p.image_filename,
        p.cost_price, p.is_combo, p.is_service, p.min_stock,
        c.name AS category_name, c.id   AS category_id,
        ps.qty,
        COALESCE((SELECT SUM(quantity) FROM sale_items WHERE product_id = p.id), 0) AS total_sold
      FROM products p
      LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE (p.is_service = true OR ps.product_id IS NOT NULL)
      ${searchFilter}
      ORDER BY total_sold DESC, p.name ASC
    `, { replacements, type: Sequelize.QueryTypes.SELECT });

    if (productsRaw.length === 0) return res.json({ ok: true, data: [] });

    // 2. Para los que son combos, calcular stock virtual y costo
    const comboIds = productsRaw.filter(p => p.is_combo).map(p => p.id);
    const ingredientStockMap = {}; // combo_id => stock virtual
    const comboCostMap = {}; // combo_id => costo calculado
    
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
        WHERE pci.combo_id IN (:cids)
      `, { replacements: { wid: warehouseId, cids: comboIds }, type: Sequelize.QueryTypes.SELECT });

      // Agrupar por combo y calcular el mínimo de kits posibles
      const byCombo = {};
      comboData.forEach(row => {
        if (!byCombo[row.combo_id]) byCombo[row.combo_id] = [];
        byCombo[row.combo_id].push(row);
      });

      comboIds.forEach(cid => {
        const rows = byCombo[cid] || [];
        if (rows.length === 0) { 
          ingredientStockMap[cid] = 0; 
          comboCostMap[cid] = 0;
          return; 
        }
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
      id: p.id,
      name: p.name,
      price: parseFloat(p.price),
      unit: p.unit,
      qty_step: parseFloat(p.qty_step || 1),
      image_filename: p.image_filename,
      cost_price: p.is_combo ? (comboCostMap[p.id] ?? 0) : parseFloat(p.cost_price || 0),
      stock: p.is_combo ? (ingredientStockMap[p.id] ?? 0) : (parseFloat(p.qty) || 0),
      sales: parseFloat(p.total_sold),
      category_name: p.category_name,
      category_id: p.category_id,
      is_combo: p.is_combo,
      is_service: p.is_service,
      image_url: p.image_filename ? `/uploads/${p.image_filename}` : null
    }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener productos del almacén" });
  }
};

module.exports = {
  getAll, getStock, getProducts, getTransfers, getByEmployee,
  create, update, remove, assignEmployees, addStock, setStock, removeStock, transfer
};