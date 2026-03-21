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
    const stocks = await ProductStock.findAll({
      where: { warehouse_id: req.params.id },
      include: [
        {
          model: Product,
          attributes: ['name', 'unit', 'price', 'cost_price', 'image_filename'],
          include: [{ model: Category, attributes: ['name'] }]
        }
      ],
      order: [[Product, Category, 'name', 'ASC'], [Product, 'name', 'ASC']]
    });

    const data = stocks.map(s => ({
      product_id: s.product_id,
      qty: parseFloat(s.qty),
      product_name: s.Product?.name,
      unit: s.Product?.unit,
      price: parseFloat(s.Product?.price || 0),
      cost_price: parseFloat(s.Product?.cost_price || 0),
      image_filename: s.Product?.image_filename,
      category_name: s.Product?.Category?.name ?? 'Sin Categoría'
    }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener stock" });
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
    const { warehouse_id, product_id, limit = 50 } = req.query;

    const where = {};
    if (warehouse_id) {
      where[Op.or] = [
        { from_warehouse_id: warehouse_id },
        { to_warehouse_id: warehouse_id }
      ];
    }
    if (product_id) where.product_id = product_id;

    const transfers = await StockTransfer.findAll({
      where,
      include: [
        { model: Warehouse, as: 'FromWarehouse', attributes: ['name'], required: false },
        { model: Warehouse, as: 'ToWarehouse', attributes: ['name'], required: false },
        { model: Employee, attributes: ['full_name'], required: false }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit)
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

    res.json({ ok: true, data });
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
    const newQty = parseFloat(stockEntry.qty) + parsedQty;
    res.json({ ok: true, message: `${product.name}: +${parsedQty} unidades sumadas al almacén` });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "Error al agregar producto al almacén" });
  }
};

// GET /api/warehouses/:id/products
const getProducts = async (req, res) => {
  try {
    const { search } = req.query;

    const productWhere = {};
    if (search) {
      productWhere[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { '$Category.name$': { [Op.iLike]: `%${search}%` } }
      ];
    }

    const stocks = await ProductStock.findAll({
      where: { warehouse_id: req.params.id },
      include: [
        {
          model: Product,
          where: productWhere,
          include: [{ model: Category, attributes: ['name', 'id'] }]
        }
      ],
      order: [[Product, Category, 'name', 'ASC'], [Product, 'name', 'ASC']]
    });

    const data = stocks.map(ps => ({
      id: ps.Product.id,
      name: ps.Product.name,
      price: parseFloat(ps.Product.price),
      unit: ps.Product.unit,
      qty_step: parseFloat(ps.Product.qty_step),
      image_filename: ps.Product.image_filename,
      cost_price: parseFloat(ps.Product.cost_price || 0),
      stock: parseFloat(ps.qty),
      category_name: ps.Product.Category?.name,
      category_id: ps.Product.Category?.id,
      image_url: ps.Product.image_filename ? `/uploads/${ps.Product.image_filename}` : null
    }));

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener productos del almacén" });
  }
};

module.exports = {
  getAll, getStock, getByEmployee, getProducts,
  create, update, remove,
  transfer, getTransfers, assignEmployees, addStock,
};