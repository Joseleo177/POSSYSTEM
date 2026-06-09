const { PaymentJournal, Currency, Bank, Sale, Sequelize, sequelize } = require("../../models");

function flattenJournal(j) {
  const jj = j.toJSON ? j.toJSON() : j;
  jj.currency_code    = jj.Currency?.code     ?? null;
  jj.currency_symbol  = jj.Currency?.symbol   ?? null;
  jj.currency_is_base = jj.Currency?.is_base  ?? null;
  jj.bank_name        = jj.Bank?.name         ?? null;
  delete jj.Currency; delete jj.Bank;
  return jj;
}

function tenantFilter(req) {
  const company_id  = req.employee?.company_id ?? null;
  const scoped      = !!company_id;
  return {
    tenantWhere: scoped ? { company_id } : {},
    tc:  scoped ? `AND p.company_id = ${parseInt(company_id)}`  : '',
    tce: scoped ? `AND e.company_id = ${parseInt(company_id)}`  : '',
    tp:  scoped ? ` AND payment_journal_id = :id AND company_id = ${parseInt(company_id)}` : ' AND payment_journal_id = :id',
    texp:scoped ? ` AND payment_journal_id = :id AND company_id = ${parseInt(company_id)}` : ' AND payment_journal_id = :id',
  };
}

async function getAll(req) {
  const { tenantWhere } = tenantFilter(req);
  const journals = await PaymentJournal.findAll({
    where: tenantWhere,
    include: [
      { model: Currency, attributes: ['code', 'symbol', 'is_base'], required: false },
      { model: Bank,     attributes: ['name'],                      required: false }
    ],
    order: [['sort_order', 'ASC'], ['id', 'ASC']]
  });
  return { data: journals.map(flattenJournal) };
}

async function createJournal({ name, type, bank_id, color, sort_order, currency_id }) {
  if (!name) { const e = new Error("El nombre es requerido"); e.status = 400; throw e; }
  const journal = await PaymentJournal.create({
    name,
    type:        type        || null,
    bank_id:     bank_id     || null,
    color:       color       || "#555555",
    sort_order:  sort_order  ?? 0,
    currency_id: currency_id || null
  });
  return { data: journal };
}

async function updateJournal(id, { name, type, bank_id, color, active, sort_order, currency_id }) {
  const journal = await PaymentJournal.findByPk(id);
  if (!journal) { const e = new Error("Diario no encontrado"); e.status = 404; throw e; }
  await journal.update({
    name,
    type:        type        || null,
    bank_id:     bank_id     || null,
    color:       color       || "#555555",
    active:      active      ?? true,
    sort_order:  sort_order  ?? 0,
    currency_id: currency_id || null
  });
  return { data: journal };
}

async function deleteJournal(id) {
  const count = await Sale.count({ where: { payment_journal_id: id } });
  if (count > 0) { const e = new Error("No se puede eliminar: tiene ventas asociadas"); e.status = 400; throw e; }
  const journal = await PaymentJournal.findByPk(id);
  if (!journal) { const e = new Error("Diario no encontrado"); e.status = 404; throw e; }
  await journal.destroy();
  return { message: "Diario eliminado" };
}

async function getSummary(req) {
  const { date_from, date_to } = req.query;
  const { tenantWhere, tc, tce } = tenantFilter(req);
  const company_id  = req.employee?.company_id ?? null;
  const tci = company_id ? `AND i.company_id = ${parseInt(company_id)}` : '';

  const buildDateClause = (alias) => {
    const col = `${alias}."created_at"`;
    let clause = '';
    if (date_from) clause += ` AND ${col} >= '${date_from}'`;
    if (date_to)   clause += ` AND ${col} < ('${date_to}'::date + INTERVAL '1 day')`;
    return clause;
  };
  const pDate = buildDateClause('p');
  const eDate = buildDateClause('e');
  const iDate = buildDateClause('i');

  // Timezone-aware "today" for Venezuela (UTC-4)
  const todayP = `(p.created_at AT TIME ZONE 'America/Caracas')::date = (NOW() AT TIME ZONE 'America/Caracas')::date`;
  const todayE = `(e.created_at AT TIME ZONE 'America/Caracas')::date = (NOW() AT TIME ZONE 'America/Caracas')::date`;
  const todayI = `(i.created_at AT TIME ZONE 'America/Caracas')::date = (NOW() AT TIME ZONE 'America/Caracas')::date`;

  const journals = await PaymentJournal.findAll({
    attributes: [
      'id', 'name', 'type', 'bank_id', 'color', 'currency_id',
      [Sequelize.literal(`(
        SELECT COUNT(p.id) FROM payments p
        JOIN sales s ON p.sale_id = s.id AND s.status NOT IN ('anulado', 'devuelto')
        WHERE p.payment_journal_id = "PaymentJournal".id ${pDate} ${tc}
      )`), 'tx_count'],
      [Sequelize.literal(`(
        (SELECT COALESCE(SUM(p."amount" * COALESCE(p."exchange_rate", 1)), 0)
         FROM payments p JOIN sales s ON p.sale_id = s.id AND s.status NOT IN ('anulado', 'devuelto')
         WHERE p.payment_journal_id = "PaymentJournal".id ${pDate} ${tc})
        +
        (SELECT COALESCE(SUM(i."amount" * COALESCE(i."rate", 1)), 0) FROM incomes i
         WHERE i.payment_journal_id = "PaymentJournal".id AND i.status = 'activo' ${iDate} ${tci})
        -
        (SELECT COALESCE(SUM(e."amount" * COALESCE(e."rate", 1)), 0) FROM expenses e
         WHERE e.payment_journal_id = "PaymentJournal".id AND e.status = 'activo' ${eDate} ${tce})
      )`), 'total_ingresos'],
      [Sequelize.literal(`(
        (SELECT COALESCE(SUM(p."amount" * COALESCE(p."exchange_rate", 1)), 0)
         FROM payments p JOIN sales s ON p.sale_id = s.id AND s.status NOT IN ('anulado', 'devuelto')
         WHERE p.payment_journal_id = "PaymentJournal".id AND ${todayP} ${tc})
        +
        (SELECT COALESCE(SUM(i."amount" * COALESCE(i."rate", 1)), 0) FROM incomes i
         WHERE i.payment_journal_id = "PaymentJournal".id AND i.status = 'activo' AND ${todayI} ${tci})
        -
        (SELECT COALESCE(SUM(e."amount" * COALESCE(e."rate", 1)), 0) FROM expenses e
         WHERE e.payment_journal_id = "PaymentJournal".id AND e.status = 'activo' AND ${todayE} ${tce})
      )`), 'ingresos_hoy'],
    ],
    include: [
      { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'], required: false },
      { model: Bank,     attributes: ['name'],                                        required: false }
    ],
    where: { active: true, ...tenantWhere },
    order: [['sort_order', 'ASC'], ['id', 'ASC']]
  });

  const data = journals.map(j => {
    const jj = j.get({ plain: true });
    jj.bank_name        = jj.Bank?.name             ?? null;
    jj.currency_code    = jj.Currency?.code         ?? null;
    jj.currency_symbol  = jj.Currency?.symbol       ?? null;
    jj.currency_is_base = jj.Currency?.is_base      ?? true;
    jj.exchange_rate    = jj.Currency?.exchange_rate ?? 1;
    delete jj.Bank; delete jj.Currency; delete jj.Payments;
    return jj;
  });
  return { data };
}

async function getMovements(req) {
  const { id } = req.params;
  const { date_from, date_to, limit = 200, offset = 0 } = req.query;
  const { tc, tce: te, tp, texp } = tenantFilter(req);

  // Tenant filter para incomes (mismo patrón que tp/texp pero para tabla incomes)
  const company_id  = req.employee?.company_id ?? null;
  const scoped      = !!company_id;
  const ti   = scoped ? ` AND payment_journal_id = :id AND company_id = ${parseInt(company_id)}` : ' AND payment_journal_id = :id';
  const tci  = scoped ? `AND i.company_id = ${parseInt(company_id)}` : '';

  const journal = await PaymentJournal.findByPk(id, {
    include: [
      { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'] },
      { model: Bank,     attributes: ['name'] },
    ],
  });
  if (!journal) { const e = new Error("Diario no encontrado"); e.status = 404; throw e; }

  const sd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const safeFrom = sd(date_from);
  const safeTo   = sd(date_to);

  let datePay = '';
  let dateExp = '';
  let dateInc = '';
  if (safeFrom) {
    datePay += ` AND p.created_at >= '${safeFrom}'`;
    dateExp += ` AND e.created_at >= '${safeFrom}'`;
    dateInc += ` AND i.created_at >= '${safeFrom}'`;
  }
  if (safeTo) {
    datePay += ` AND p.created_at < ('${safeTo}'::date + INTERVAL '1 day')`;
    dateExp += ` AND e.created_at < ('${safeTo}'::date + INTERVAL '1 day')`;
    dateInc += ` AND i.created_at < ('${safeTo}'::date + INTERVAL '1 day')`;
  }

  // Saldo real del diario — incluye payments (ventas) + incomes (manuales) - expenses
  const [currBal] = await sequelize.query(`
    SELECT (
      COALESCE((SELECT SUM(amount * COALESCE(exchange_rate, 1)) FROM payments WHERE TRUE ${tp}), 0)
      + COALESCE((SELECT SUM(amount * COALESCE(rate, 1))        FROM incomes  WHERE status = 'activo' AND TRUE ${ti}), 0)
      - COALESCE((SELECT SUM(amount * COALESCE(rate, 1))        FROM expenses WHERE status = 'activo' AND TRUE ${texp}), 0)
    ) as balance
  `, { replacements: { id }, type: Sequelize.QueryTypes.SELECT });
  const currentBalance = parseFloat(currBal?.balance || 0);

  const [countResult] = await sequelize.query(`
    SELECT (
      (SELECT COUNT(*) FROM payments p WHERE p.payment_journal_id = :id ${datePay} ${tc})
      +
      (SELECT COUNT(*) FROM incomes  i WHERE i.payment_journal_id = :id AND i.status = 'activo' ${dateInc} ${tci})
      +
      (SELECT COUNT(*) FROM expenses e WHERE e.payment_journal_id = :id AND e.status = 'activo' ${dateExp} ${te})
    ) as total
  `, { replacements: { id }, type: Sequelize.QueryTypes.SELECT });

  // Saldo de arrastre: todo lo ocurrido ANTES de date_from (si hay filtro de fecha)
  let preBalance = 0;
  if (safeFrom) {
    const [prevBal] = await sequelize.query(`
      SELECT (
        COALESCE((SELECT SUM(amount * COALESCE(exchange_rate, 1)) FROM payments WHERE created_at < :date_from ${tp}), 0)
        + COALESCE((SELECT SUM(amount * COALESCE(rate, 1)) FROM incomes  WHERE status = 'activo' AND created_at < :date_from ${ti}), 0)
        - COALESCE((SELECT SUM(amount * COALESCE(rate, 1)) FROM expenses WHERE status = 'activo' AND created_at < :date_from ${texp}), 0)
      ) as balance
    `, { replacements: { id, date_from: safeFrom }, type: Sequelize.QueryTypes.SELECT });
    preBalance = parseFloat(prevBal?.balance || 0);
  }

  // Window function calcula el saldo acumulado correcto en orden ASC; el query externo ordena DESC y pagina.
  const rows = await sequelize.query(`
    SELECT * FROM (
      SELECT *,
        SUM(CASE WHEN type = 'ingreso' THEN amount_local ELSE -amount_local END)
          OVER (ORDER BY date ASC, id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
          + :pre_balance AS balance
      FROM (
        SELECT
          p.id,
          'ingreso'                                               AS type,
          p.created_at                                           AS date,
          COALESCE(s.invoice_number, CONCAT('PAY-', p.id))      AS reference,
          COALESCE(c.name, 'Pago de venta')                     AS concept,
          (p.amount * COALESCE(p.exchange_rate, 1))             AS amount_local,
          p.amount                                               AS amount_base,
          COALESCE(p.exchange_rate, 1)                          AS rate,
          p.reference_number                                     AS doc_ref,
          p.notes,
          'activo'                                               AS status
        FROM payments p
        LEFT JOIN sales s     ON s.id = p.sale_id
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.payment_journal_id = :id ${datePay} ${tc}

        UNION ALL

        SELECT
          i.id,
          'ingreso'                                               AS type,
          i.created_at                                           AS date,
          COALESCE(i.reference, CONCAT('INC-', i.id))           AS reference,
          i.description                                          AS concept,
          (i.amount * COALESCE(i.rate, 1))                      AS amount_local,
          i.amount                                               AS amount_base,
          COALESCE(i.rate, 1)                                    AS rate,
          NULL                                                   AS doc_ref,
          i.notes,
          i.status
        FROM incomes i
        WHERE i.payment_journal_id = :id AND i.status = 'activo' ${dateInc} ${tci}

        UNION ALL

        SELECT
          e.id,
          'egreso'                                               AS type,
          e.created_at                                           AS date,
          COALESCE(e.reference, CONCAT('EGR-', e.id))          AS reference,
          e.description                                          AS concept,
          (e.amount * COALESCE(e.rate, 1))                     AS amount_local,
          e.amount                                               AS amount_base,
          COALESCE(e.rate, 1)                                   AS rate,
          NULL                                                   AS doc_ref,
          e.notes,
          e.status
        FROM expenses e
        WHERE e.payment_journal_id = :id AND e.status = 'activo' ${dateExp} ${te}
      ) all_movements
    ) with_balance
    ORDER BY date DESC, id DESC
    LIMIT :limit OFFSET :offset
  `, {
    replacements: { id, pre_balance: preBalance, limit: parseInt(limit), offset: parseInt(offset) },
    type: Sequelize.QueryTypes.SELECT,
  });

  const data = rows.map(row => ({
    ...row,
    amount_local: parseFloat(row.amount_local || 0),
    amount_base:  parseFloat(row.amount_base  || 0),
    rate:         parseFloat(row.rate         || 1),
    balance:      parseFloat(row.balance      || 0),
  }));

  const jj = journal.get({ plain: true });
  return {
    journal: {
      id:              jj.id,
      name:            jj.name,
      color:           jj.color,
      currency_code:   jj.Currency?.code   || null,
      currency_symbol: jj.Currency?.symbol || 'Ref.',
      bank_name:       jj.Bank?.name       || null,
      current_balance: currentBalance,
    },
    data,
    total: parseInt(countResult?.total || 0),
  };
}

module.exports = { getAll, createJournal, updateJournal, deleteJournal, getSummary, getMovements };
