const { CashSession, CashSessionJournal, sequelize, SESSION_INCLUDE } = require("./shared");

module.exports = async function openSession(body) {
  const t = await sequelize.transaction();
  try {
    const { employee_id, warehouse_id, journals = [] } = body;
    if (!employee_id || !warehouse_id) throw new Error("employee_id y warehouse_id son requeridos");
    if (!journals.length) throw new Error("Debes incluir al menos un diario de efectivo");

    const existing = await CashSession.findOne({ where: { employee_id, warehouse_id, status: "open" }, transaction: t });
    if (existing) {
      const err = new Error("Ya existe una sesión de caja abierta");
      err.status = 409;
      err.session = existing;
      throw err;
    }

    const session = await CashSession.create({ employee_id, warehouse_id, status: "open" }, { transaction: t });
    await CashSessionJournal.bulkCreate(
      journals.map((j) => ({
        session_id: session.id,
        journal_id: j.journal_id,
        opening_amount: parseFloat(j.opening_amount) || 0,
      })),
      { transaction: t }
    );

    await t.commit();
    const full = await CashSession.findByPk(session.id, { include: SESSION_INCLUDE });
    return full;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
