const {
  Warehouse, Product, ProductStock, StockTransfer, Employee, Sequelize, sequelize
} = require("../../models");
const { Op } = Sequelize;

async function createTransfer(req) {
  const { from_warehouse_id, to_warehouse_id, product_id, qty, note } = req.body;
  if (!from_warehouse_id || !to_warehouse_id || !product_id || !qty) {
    const e = new Error("Origen, destino, producto y cantidad son requeridos"); e.status = 400; throw e;
  }
  if (parseInt(from_warehouse_id) === parseInt(to_warehouse_id)) {
    const e = new Error("El almacén origen y destino deben ser distintos"); e.status = 400; throw e;
  }
  const parsedQty = parseFloat(qty);
  if (isNaN(parsedQty) || parsedQty <= 0) {
    const e = new Error("La cantidad debe ser mayor a 0"); e.status = 400; throw e;
  }

  const transaction = await sequelize.transaction();
  try {
    const product = await Product.findByPk(product_id, { transaction, lock: true });
    if (!product) { const e = new Error("Producto no encontrado"); e.status = 404; throw e; }

    const fromStock = await ProductStock.findOne({
      where: { warehouse_id: from_warehouse_id, product_id },
      transaction,
      lock: true
    });
    const available = parseFloat(fromStock?.qty || 0);
    if (available < parsedQty) {
      const e = new Error(`Stock insuficiente en el almacén origen. Disponible: ${available}`); e.status = 400; throw e;
    }
    await fromStock.decrement('qty', { by: parsedQty, transaction });

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

    const totalStock = await ProductStock.sum('qty', { where: { product_id }, transaction });
    await product.update({ stock: totalStock }, { transaction });

    await transaction.commit();
    return { data: transferRow };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function getTransfers(req) {
  const { warehouse_id, product_id, limit = 50, offset = 0 } = req.query;

  const where = {};
  if (warehouse_id) {
    where[Op.or] = [{ from_warehouse_id: warehouse_id }, { to_warehouse_id: warehouse_id }];
  }
  if (product_id) where.product_id = product_id;

  const { count, rows: transfers } = await StockTransfer.findAndCountAll({
    where,
    include: [
      { model: Warehouse, as: 'FromWarehouse', attributes: ['name'], required: false },
      { model: Warehouse, as: 'ToWarehouse',   attributes: ['name'], required: false },
      { model: Employee,                        attributes: ['full_name'], required: false }
    ],
    order: [['created_at', 'DESC']],
    limit:  parseInt(limit),
    offset: parseInt(offset)
  });

  const data = transfers.map(t => {
    const item = t.toJSON();
    item.from_warehouse_name = item.FromWarehouse?.name ?? null;
    item.to_warehouse_name   = item.ToWarehouse?.name   ?? null;
    item.employee_name       = item.Employee?.full_name  ?? null;
    delete item.FromWarehouse;
    delete item.ToWarehouse;
    delete item.Employee;
    return item;
  });

  return { data, total: count };
}

module.exports = { createTransfer, getTransfers };
