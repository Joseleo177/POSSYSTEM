const { CashSession, SESSION_INCLUDE } = require("./shared");

module.exports = async function getHistory(query) {
  const { employee_id, warehouse_id } = query;
  const where = { status: "closed" };
  if (employee_id) where.employee_id = employee_id;
  if (warehouse_id) where.warehouse_id = warehouse_id;

  const sessions = await CashSession.findAll({
    where,
    include: SESSION_INCLUDE,
    order: [["closed_at", "DESC"]],
  });
  return sessions;
};
