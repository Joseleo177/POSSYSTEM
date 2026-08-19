const { CashSession, SESSION_INCLUDE } = require("./shared");
const { Op } = require("sequelize");
const { visibleWarehouseIds, assertWarehouseAccess } = require("../../middleware/auth");

module.exports = async function getHistory(query, req) {
  const { employee_id, warehouse_id } = query;
  const where = { status: "closed" };
  if (employee_id) where.employee_id = employee_id;

  // El historial de cajas es por sucursal: cada quien ve las de sus almacenes.
  if (warehouse_id) {
    await assertWarehouseAccess(req, warehouse_id);
    where.warehouse_id = warehouse_id;
  } else {
    const allowedWarehouses = await visibleWarehouseIds(req);
    if (allowedWarehouses) where.warehouse_id = { [Op.in]: allowedWarehouses };
  }

  const sessions = await CashSession.findAll({
    where,
    include: SESSION_INCLUDE,
    order: [["closed_at", "DESC"]],
  });
  return sessions;
};
