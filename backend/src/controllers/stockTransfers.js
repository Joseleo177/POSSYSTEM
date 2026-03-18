const { StockTransfer, Warehouse, Employee, Product, ProductStock, Sequelize, sequelize } = require("../models");
const { Op } = Sequelize;

// GET /api/stock-transfers
const getAll = async (req, res) => {
  try {
    const { warehouse_id, product_id, limit = 100 } = req.query;
    
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
      item.to_warehouse_name   = item.ToWarehouse?.name   ?? null;
      item.employee_name       = item.Employee?.full_name ?? null;
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

// POST /api/stock-transfers
const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { from_warehouse_id, to_warehouse_id, product_id, qty, note } = req.body;
    if (!from_warehouse_id || !to_warehouse_id || !product_id || !qty)
      throw new Error("from_warehouse_id, to_warehouse_id, product_id y qty son requeridos");
    
    if (parseInt(from_warehouse_id) === parseInt(to_warehouse_id))
      throw new Error("El inventario origen y destino deben ser diferentes");

    const qtyN = parseFloat(qty);
    if (qtyN <= 0) throw new Error("La cantidad debe ser mayor a 0");

    const product = await Product.findByPk(product_id, { transaction, lock: true });
    if (!product) throw new Error("Producto no encontrado");

    // Bloquear y validar origen
    const fromStock = await ProductStock.findOne({
      where: { warehouse_id: from_warehouse_id, product_id },
      transaction,
      lock: true
    });
    const available = fromStock ? parseFloat(fromStock.qty) : 0;
    if (available < qtyN)
      throw new Error(`Stock insuficiente en inventario origen (disponible: ${available})`);

    // Descontar origen
    await fromStock.decrement('qty', { by: qtyN, transaction });

    // Agregar destino
    const [toStock] = await ProductStock.findOrCreate({
      where: { warehouse_id: to_warehouse_id, product_id },
      defaults: { qty: 0 },
      transaction,
      lock: true
    });
    await toStock.increment('qty', { by: qtyN, transaction });

    // Registrar transferencia
    const transfer = await StockTransfer.create({
      from_warehouse_id,
      to_warehouse_id,
      product_id,
      product_name: product.name,
      qty: qtyN,
      note: note || null,
      employee_id: req.employee?.id || null
    }, { transaction });

    await transaction.commit();
    res.status(201).json({ ok: true, data: transfer });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error(err);
    const status = /insuficiente|no encontrado/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

module.exports = { getAll, create };
