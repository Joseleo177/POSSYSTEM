const { CashSession, SESSION_INCLUDE } = require("./shared");

module.exports = async function getCurrentSession(query) {
  const { employee_id, warehouse_id } = query;
  if (!employee_id || !warehouse_id) throw new Error("employee_id y warehouse_id son requeridos");

  const session = await CashSession.findOne({
    where: { employee_id, warehouse_id, status: "open" },
    include: SESSION_INCLUDE,
  });
  return session || null;
};
