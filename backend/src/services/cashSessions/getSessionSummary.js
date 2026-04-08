const { CashSession, sequelize, Sequelize, SESSION_INCLUDE } = require("./shared");

module.exports = async function getSessionSummary(id) {
  const session = await CashSession.findByPk(id, { include: SESSION_INCLUDE });
  if (!session) {
    const err = new Error("Sesión no encontrada");
    err.status = 404;
    throw err;
  }

  const openedAt = session.opened_at;
  const closedAt = session.closed_at || new Date();
  const wid = session.warehouse_id;
  const eid = session.employee_id;

  const [salesSummary] = await sequelize.query(
    `
      SELECT COUNT(*)::int AS sale_count,
        COALESCE(SUM(total), 0)::float AS total_sales,
        COALESCE(SUM(discount_amount), 0)::float AS total_discounts,
        COALESCE(SUM(CASE WHEN LOWER(status) IN ('pagada', 'pagado') THEN total ELSE 0 END), 0)::float AS total_paid,
        COALESCE(SUM(CASE WHEN LOWER(status) = 'pendiente' THEN total ELSE 0 END), 0)::float AS total_pending,
        COUNT(CASE WHEN LOWER(status) IN ('pagada', 'pagado') THEN 1 END)::int AS paid_count,
        COUNT(CASE WHEN LOWER(status) = 'pendiente' THEN 1 END)::int AS pending_count
      FROM sales
      WHERE warehouse_id = :wid AND employee_id = :eid
        AND created_at >= :openedAt AND created_at < :closedAt
        AND status <> 'cancelada'
    `,
    {
      type: Sequelize.QueryTypes.SELECT,
      replacements: {
        wid,
        eid,
        openedAt: openedAt.toISOString(),
        closedAt: closedAt.toISOString(),
      },
    }
  );

  const paymentsByJournal = await sequelize.query(
    `
      SELECT pj.id, pj.name AS journal_name, pj.type AS journal_type, pj.color AS journal_color,
        c.symbol AS currency_symbol,
        COUNT(p.id)::int AS payment_count,
        COALESCE(SUM(p.amount * p.exchange_rate), 0)::float AS total
      FROM payments p
      JOIN payment_journals pj ON p.payment_journal_id = pj.id
      LEFT JOIN currencies c ON pj.currency_id = c.id
      JOIN sales s ON p.sale_id = s.id
      WHERE s.warehouse_id = :wid AND s.employee_id = :eid
        AND p.created_at >= :openedAt AND p.created_at < :closedAt
      GROUP BY pj.id, pj.name, pj.type, pj.color, c.symbol
      ORDER BY total DESC
    `,
    {
      type: Sequelize.QueryTypes.SELECT,
      replacements: {
        wid,
        eid,
        openedAt: openedAt.toISOString(),
        closedAt: closedAt.toISOString(),
      },
    }
  );

  const journalSummary = (session.journals || []).map((sj) => {
    const collected = paymentsByJournal.find((p) => p.id === sj.journal_id);
    const cashIn = parseFloat(collected?.total || 0);
    const expected = parseFloat(sj.opening_amount || 0) + cashIn;
    return {
      journal_id: sj.journal_id,
      journal_name: sj.journal?.name,
      journal_color: sj.journal?.color,
      currency_symbol: sj.journal?.Currency?.symbol || collected?.currency_symbol || "$",
      opening_amount: parseFloat(sj.opening_amount || 0),
      cash_in: cashIn,
      expected_amount: parseFloat(expected.toFixed(2)),
      closing_amount: sj.closing_amount != null ? parseFloat(sj.closing_amount) : null,
      difference: sj.difference != null ? parseFloat(sj.difference) : null,
    };
  });

  const [returnsSummary] = await sequelize.query(
    `
      SELECT COUNT(*)::int AS count, COALESCE(SUM(r.total), 0)::float AS total
      FROM returns r JOIN sales s ON r.sale_id = s.id
      WHERE s.warehouse_id = :wid
        AND r.created_at >= :openedAt AND r.created_at < :closedAt
    `,
    {
      type: Sequelize.QueryTypes.SELECT,
      replacements: { wid, openedAt: openedAt.toISOString(), closedAt: closedAt.toISOString() },
    }
  );

  const salesList = await sequelize.query(
    `
      SELECT s.id, s.invoice_number, s.total, s.status, s.created_at,
             c.name AS customer_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.warehouse_id = :wid AND s.employee_id = :eid
        AND s.created_at >= :openedAt AND s.created_at < :closedAt
        AND s.status <> 'cancelada'
      ORDER BY s.created_at DESC
    `,
    {
      type: Sequelize.QueryTypes.SELECT,
      replacements: { wid, eid, openedAt: openedAt.toISOString(), closedAt: closedAt.toISOString() },
    }
  );

  return {
    session,
    sales: salesSummary,
    sales_list: salesList,
    payments_by_journal: paymentsByJournal,
    journal_summary: journalSummary,
    returns: returnsSummary,
  };
};
