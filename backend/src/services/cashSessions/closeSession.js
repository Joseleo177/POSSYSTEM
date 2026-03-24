const { CashSession, sequelize, Sequelize, SESSION_INCLUDE } = require("./shared");

module.exports = async function closeSession(id, body) {
  const t = await sequelize.transaction();
  try {
    const { journals = [], notes } = body;
    const session = await CashSession.findByPk(id, { include: SESSION_INCLUDE, transaction: t });
    if (!session) {
      const err = new Error("Sesión no encontrada");
      err.status = 404;
      throw err;
    }
    if (session.status === "closed") {
      const err = new Error("Esta sesión ya fue cerrada");
      err.status = 409;
      throw err;
    }

    const openedAt = session.opened_at;
    const closedAt = new Date();

    const cashPayments = await sequelize.query(
      `
      SELECT p.payment_journal_id AS journal_id, COALESCE(SUM(p.amount), 0)::float AS total
      FROM payments p JOIN sales s ON p.sale_id = s.id
      WHERE s.warehouse_id = :warehouseId AND s.employee_id = :employeeId
        AND p.created_at >= :openedAt AND p.created_at < :closedAt
      GROUP BY p.payment_journal_id
    `,
      {
        type: Sequelize.QueryTypes.SELECT,
        transaction: t,
        replacements: {
          warehouseId: session.warehouse_id,
          employeeId: session.employee_id,
          openedAt: openedAt.toISOString(),
          closedAt: closedAt.toISOString(),
        },
      }
    );

    for (const sj of session.journals) {
      const input = journals.find((j) => j.journal_id === sj.journal_id);
      const cashIn = parseFloat(cashPayments.find((p) => p.journal_id === sj.journal_id)?.total || 0);
      const expected = parseFloat(sj.opening_amount) + cashIn;
      const closing = input ? parseFloat(input.closing_amount) : null;
      const diff = closing != null ? parseFloat((closing - expected).toFixed(2)) : null;
      await sj.update(
        { closing_amount: closing, expected_amount: parseFloat(expected.toFixed(2)), difference: diff },
        { transaction: t }
      );
    }

    await session.update({ status: "closed", notes: notes || null, closed_at: closedAt }, { transaction: t });
    await t.commit();
    return CashSession.findByPk(session.id, { include: SESSION_INCLUDE });
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
