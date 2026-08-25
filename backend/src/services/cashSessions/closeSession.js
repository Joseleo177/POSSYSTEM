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
      SELECT p.payment_journal_id AS journal_id, COALESCE(SUM(p.amount * p.exchange_rate), 0)::float AS total
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

    // Salidas de la gaveta: TODOS los egresos activos de esta caja registrados por este
    // empleado durante el turno, sea un vuelto o un gasto.
    //
    // Antes se leía `payments.change_given`, que tiene dos problemas. Uno: solo ve los vueltos,
    // así que pagar un flete con el efectivo de la caja aparecía como faltante al cerrar. Dos:
    // cuando el vuelto sale de dos cajas —2$ en divisas y el resto en bolívares—, el pago
    // guarda el TOTAL apuntando a la primera, y el arqueo le reclamaba a esa gaveta un dinero
    // que había salido de la otra. Los egresos sí llevan una fila por caja con su monto, y son
    // los mismos que ya usaba el resumen del turno: con esto las dos pantallas por fin dicen
    // lo mismo, que era otra fuente de descuadres.
    const expensesOut = await sequelize.query(
      `
      SELECT e.payment_journal_id AS journal_id,
             COALESCE(SUM(e.amount * COALESCE(e.rate, 1)), 0)::float AS total_out
      FROM expenses e
      WHERE e.status = 'activo'
        AND e.payment_journal_id IS NOT NULL
        AND e.warehouse_id = :warehouseId
        AND e.employee_id = :employeeId
        AND e.created_at >= :openedAt AND e.created_at < :closedAt
      GROUP BY e.payment_journal_id
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

    // Lo que entró a mano a la gaveta durante el turno.
    const incomesIn = await sequelize.query(
      `
      SELECT i.payment_journal_id AS journal_id,
             COALESCE(SUM(i.amount * COALESCE(i.rate, 1)), 0)::float AS total_in
      FROM incomes i
      WHERE i.status = 'activo'
        AND i.payment_journal_id IS NOT NULL
        AND i.warehouse_id = :warehouseId
        AND i.employee_id = :employeeId
        AND i.created_at >= :openedAt AND i.created_at < :closedAt
      GROUP BY i.payment_journal_id
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
      const manualIn = parseFloat(incomesIn.find((i) => i.journal_id === sj.journal_id)?.total_in || 0);
      const cashOut = parseFloat(expensesOut.find((c) => c.journal_id === sj.journal_id)?.total_out || 0);
      const expected = parseFloat(sj.opening_amount) + cashIn + manualIn - cashOut;
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
