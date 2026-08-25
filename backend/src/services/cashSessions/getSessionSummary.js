const { CashSession, sequelize, Sequelize, SESSION_INCLUDE } = require("./shared");
const { assertWarehouseAccess } = require("../../middleware/auth");

module.exports = async function getSessionSummary(id, req) {
  const session = await CashSession.findByPk(id, { include: SESSION_INCLUDE });
  if (!session) {
    const err = new Error("Sesión no encontrada");
    err.status = 404;
    throw err;
  }

  // El cuadre de una caja es de su sucursal: no se abre desde otra.
  await assertWarehouseAccess(req, session.warehouse_id, { optional: true });

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
        COUNT(CASE WHEN LOWER(status) = 'pendiente' THEN 1 END)::int AS pending_count,
        -- Lo exonerado en el turno. Queda fuera de total_paid a propósito —ese dinero no está
        -- en la gaveta y el arqueo lo reclamaría como faltante—, pero el cierre tiene que
        -- poder explicar por qué se vendió más de lo que se cobró.
        COALESCE(SUM(forgiven_amount), 0)::float AS total_forgiven,
        COUNT(CASE WHEN LOWER(status) = 'exonerado' THEN 1 END)::int AS forgiven_count
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
        -- Un cobro conjunto entró como un solo pago aunque haya saldado varias facturas:
        -- contarlo por factura inflaba el número de movimientos del turno frente a los
        -- comprobantes que el cajero tiene en la mano.
        COUNT(DISTINCT COALESCE(p.batch_id, CONCAT('p', p.id)))::int AS payment_count,
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

  // Lo que salió de cada gaveta como vuelto se lee de los EGRESOS de "Cambio / Vuelto", que
  // llevan una fila por caja con su monto.
  //
  // Antes se leía de `payments.change_given`, y eso solo funciona mientras el vuelto salga de
  // una sola caja: cuando se devuelven 2$ en divisas y el resto en bolívares —lo corriente
  // cuando no hay sencillo—, el pago guarda el TOTAL apuntando a la primera caja. El arqueo le
  // reclamaba a esa gaveta un dinero que había salido de la otra, y a la otra no le descontaba
  // nada. Los egresos sí saben de dónde salió cada tramo.
  //
  // El monto va a la tasa con la que se registró el egreso (e.rate), no a la de hoy: es la que
  // convierte el importe en los billetes que de verdad se sacaron. Mismo criterio que los
  // cobros, que se suman con la tasa de su propio pago.
  // TODO egreso de la caja, no solo el vuelto: pagar un flete o comprar hielo con la plata de
  // la gaveta la deja igual de corta que devolver un cambio. Antes solo se descontaba la
  // categoría 'Cambio / Vuelto', así que cualquier otro gasto aparecía como faltante al cerrar.
  //
  // Se atribuye a quien lo registró (e.employee_id): el egreso sale de UNA caja, la de esa
  // persona. Sin ese filtro, con dos cajeros en la misma sucursal el gasto de uno se le
  // descontaba también al otro.
  const expensesByJournal = await sequelize.query(
    `
      SELECT e.payment_journal_id AS journal_id,
             COALESCE(SUM(e.amount * COALESCE(e.rate, 1)), 0)::float AS total_out
      FROM expenses e
      WHERE e.status = 'activo'
        AND e.payment_journal_id IS NOT NULL
        AND e.warehouse_id = :wid
        AND e.employee_id = :eid
        AND e.created_at >= :openedAt AND e.created_at < :closedAt
      GROUP BY e.payment_journal_id
    `,
    {
      type: Sequelize.QueryTypes.SELECT,
      replacements: { wid, eid, openedAt: openedAt.toISOString(), closedAt: closedAt.toISOString() },
    }
  );

  // Y lo que entró a mano: un ingreso manual en efectivo es dinero que está en la gaveta, así
  // que suma al esperado igual que un cobro. Sin esto aparecía como sobrante al cerrar.
  const incomesByJournal = await sequelize.query(
    `
      SELECT i.payment_journal_id AS journal_id,
             COALESCE(SUM(i.amount * COALESCE(i.rate, 1)), 0)::float AS total_in
      FROM incomes i
      WHERE i.status = 'activo'
        AND i.payment_journal_id IS NOT NULL
        AND i.warehouse_id = :wid
        AND i.employee_id = :eid
        AND i.created_at >= :openedAt AND i.created_at < :closedAt
      GROUP BY i.payment_journal_id
    `,
    {
      type: Sequelize.QueryTypes.SELECT,
      replacements: { wid, eid, openedAt: openedAt.toISOString(), closedAt: closedAt.toISOString() },
    }
  );

  const journalSummary = (session.journals || []).map((sj) => {
    const collected = paymentsByJournal.find((p) => p.id === sj.journal_id);
    const cashIn = parseFloat(collected?.total || 0);
    const manualIn = parseFloat(incomesByJournal.find((i) => i.journal_id === sj.journal_id)?.total_in || 0);
    const cashOut = parseFloat(expensesByJournal.find((c) => c.journal_id === sj.journal_id)?.total_out || 0);
    const expected = parseFloat(sj.opening_amount || 0) + cashIn + manualIn - cashOut;
    return {
      journal_id: sj.journal_id,
      journal_name: sj.journal?.name,
      journal_color: sj.journal?.color,
      currency_symbol: sj.journal?.Currency?.symbol || collected?.currency_symbol || "Ref.",
      opening_amount: parseFloat(sj.opening_amount || 0),
      cash_in: cashIn,
      manual_in: manualIn,
      // Todas las salidas de la gaveta: vueltos y gastos. `change_out` se mantiene con el
      // mismo valor para no romper lo que ya lo leía.
      cash_out: cashOut,
      change_out: cashOut,
      expected_amount: parseFloat(expected.toFixed(2)),
      closing_amount: sj.closing_amount != null ? parseFloat(sj.closing_amount) : null,
      difference: sj.difference != null ? parseFloat(sj.difference) : null,
    };
  });

  const [returnsSummary] = await sequelize.query(
    `
      SELECT COUNT(*)::int AS count, COALESCE(SUM(r.total), 0)::float AS total
      FROM returns r JOIN sales s ON r.sale_id = s.id
      WHERE r.status <> 'anulado'
        AND s.warehouse_id = :wid
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
