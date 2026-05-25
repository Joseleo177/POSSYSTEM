const {
  Warehouse, ProductStock, EmployeeWarehouse, StockTransfer, Sale, Purchase, Sequelize, sequelize
} = require("../../models");
const { Op } = Sequelize;

async function getAll() {
  // Tres queries paralelas y simples en lugar de un GROUP BY con doble JOIN.
  // La versión anterior generaba un producto cartesiano sobre product_stock
  // que escalaba mal con el tamaño del inventario.
  const [warehouses, stockAggs, assignments] = await Promise.all([
    Warehouse.findAll({
      attributes: ['id', 'name', 'description', 'active', 'sort_order', 'created_at'],
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
      raw: true,
    }),
    sequelize.query(
      `SELECT warehouse_id,
              COUNT(DISTINCT product_id)::int AS product_count,
              COALESCE(SUM(qty), 0)::float    AS total_stock
         FROM product_stock
         GROUP BY warehouse_id`,
      { type: Sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT warehouse_id, employee_id FROM employee_warehouses`,
      { type: Sequelize.QueryTypes.SELECT }
    ),
  ]);

  const aggByWh = new Map(stockAggs.map(r => [r.warehouse_id, r]));
  const empsByWh = new Map();
  for (const row of assignments) {
    if (!empsByWh.has(row.warehouse_id)) empsByWh.set(row.warehouse_id, []);
    empsByWh.get(row.warehouse_id).push({ employee_id: row.employee_id });
  }

  const data = warehouses.map(w => {
    const agg = aggByWh.get(w.id);
    return {
      ...w,
      product_count: agg ? agg.product_count : 0,
      total_stock:   agg ? agg.total_stock   : 0,
      assigned_employees: empsByWh.get(w.id) || [],
    };
  });

  return { data };
}

async function getByEmployee(employeeId) {
  const warehouses = await Warehouse.findAll({
    include: [{
      model: EmployeeWarehouse,
      where: { employee_id: employeeId },
      attributes: []
    }],
    where: { active: true },
    order: [['sort_order', 'ASC'], ['name', 'ASC']]
  });
  return { data: warehouses };
}

async function createWarehouse({ name, description, sort_order = 0 }) {
  if (!name?.trim()) {
    const e = new Error("El nombre es requerido"); e.status = 400; throw e;
  }
  try {
    const warehouse = await Warehouse.create({ name: name.trim(), description: description || null, sort_order });
    return { data: warehouse };
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      const e = new Error("Ya existe un almacén con ese nombre"); e.status = 400; throw e;
    }
    throw err;
  }
}

async function updateWarehouse(id, { name, description, active, sort_order }) {
  if (!name?.trim()) {
    const e = new Error("El nombre es requerido"); e.status = 400; throw e;
  }
  const warehouse = await Warehouse.findByPk(id);
  if (!warehouse) {
    const e = new Error("Almacén no encontrado"); e.status = 404; throw e;
  }
  try {
    await warehouse.update({ name: name.trim(), description: description || null, active: active ?? true, sort_order: sort_order ?? 0 });
    return { data: warehouse };
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      const e = new Error("Ya existe un almacén con ese nombre"); e.status = 400; throw e;
    }
    throw err;
  }
}

async function deleteWarehouse(warehouseId) {
  const warehouse = await Warehouse.findByPk(warehouseId);
  if (!warehouse) {
    const e = new Error("Almacén no encontrado"); e.status = 404; throw e;
  }

  const total = await ProductStock.sum('qty', { where: { warehouse_id: warehouseId } });
  if (parseFloat(total || 0) > 0) {
    const e = new Error("No se puede eliminar un almacén con stock. Transfiere o ajusta el stock primero."); e.status = 400; throw e;
  }

  const saleCount = await Sale.count({ where: { warehouse_id: warehouseId } });
  const purchaseCount = await Purchase.count({ where: { warehouse_id: warehouseId } });
  if (saleCount > 0 || purchaseCount > 0) {
    const e = new Error("No se puede eliminar físicamente el almacén porque tiene historial de VENTAS o COMPRAS. Intenta desactivarlo en su lugar."); e.status = 400; throw e;
  }

  const transaction = await sequelize.transaction();
  try {
    await StockTransfer.destroy({
      where: { [Op.or]: [{ from_warehouse_id: warehouseId }, { to_warehouse_id: warehouseId }] },
      transaction
    });
    await ProductStock.destroy({ where: { warehouse_id: warehouseId }, transaction });
    await EmployeeWarehouse.destroy({ where: { warehouse_id: warehouseId }, transaction });
    await warehouse.destroy({ transaction });
    await transaction.commit();
    return { message: "Almacén eliminado exitosamente" };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function assignEmployees(warehouseId, employee_ids = []) {
  const transaction = await sequelize.transaction();
  try {
    await EmployeeWarehouse.destroy({ where: { warehouse_id: warehouseId }, transaction });
    for (const empId of employee_ids) {
      await EmployeeWarehouse.create({ employee_id: empId, warehouse_id: warehouseId }, { transaction });
    }
    await transaction.commit();
    return { message: "Empleados asignados correctamente" };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = { getAll, getByEmployee, createWarehouse, updateWarehouse, deleteWarehouse, assignEmployees };
