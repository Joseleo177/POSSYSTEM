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
  const isSuperuser = !!req.is_superuser;
  const scoped      = !isSuperuser && company_id;
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

  const buildDateClause = (alias) => {
    const col = `${alias}."created_at"`;
    let clause = '';
    if (date_from) clause += ` AND ${col} >= '${date_from}'`;
    if (date_to)   clause += ` AND ${col} < ('${date_to}'::date + INTERVAL '1 day')`;
    return clause;
  };
  const pDate = buildDateClause('p');
  const eDate = buildDateClause('e');

  const journals = await PaymentJournal.findAll({
    attributes: [
      'id', 'name', 'type', 'bank_id', 'color', 'currency_id',
      [Sequelize.literal(`(
        SELECT COUNT(id) FROM payments p WHERE p.payment_journal_id = "PaymentJournal".id ${pDate} ${tc}
      )`), 'tx_count'],
      [Sequelize.literal(`(
        (SELECT COALESCE(SUM("amount" * COALESCE("exchange_rate", 1)), 0) FROM payments p WHERE p.payment_journal_id = "PaymentJournal".id ${pDate} ${tc})
        -
        (SELECT COALESCE(SUM("amount" * COALESCE("rate", 1)), 0) FROM expenses e WHERE e.payment_journal_id = "PaymentJournal".id AND e.status = 'activo' ${eDate} ${tce})
      )`), 'total_ingresos'],
      [Sequelize.literal(`(
        (SELECT COALESCE(SUM("amount" * COALESCE("exchange_rate", 1)), 0) FROM payments p WHERE p.payment_journal_id = "PaymentJournal".id AND p.created_at >= CURRENT_DATE ${tc})
        -
        (SELECT COALESCE(SUM("amount" * COALESCE("rate", 1)), 0) FROM expenses e WHERE e.payment_journal_id = "PaymentJournal".id AND e.status = 'activo' AND e.created_at >= CURRENT_DATE ${tce})
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

  const journal = await PaymentJournal.findByPk(id, {
    include: [
      { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'] },
      { model: Bank,     attributes: ['name'] },
    ],
  });
  if (!journal) { const e = new Error("Diario no encontrado"); e.status = 404; throw e; }

  let datePay = '';
  let dateExp = '';
  if (date_from) {
    datePay += ` AND p.created_at >= '${date_from}'`;
    dateExp += ` AND e.created_at >= '${date_from}'`;
  }
  if (date_to) {
    datePay += ` AND p.created_at < ('${date_to}'::date + INTERVAL '1 day')`;
    dateExp += ` AND e.created_at < ('${date_to}'::date + INTERVAL '1 day')`;
  }

  const [countResult] = await sequelize.query(`
    SELECT (
      (SELECT COUNT(*) FROM payments p WHERE p.payment_journal_id = :id ${datePay} ${tc})
      +
      (SELECT COUNT(*) FROM expenses e WHERE e.payment_journal_id = :id ${dateExp} ${te})
    ) as total
  `, { replacements: { id }, type: Sequelize.QueryTypes.SELECT });

  const rows = await sequelize.query(`
    SELECT * FROM (
      SELECT
        p.id,
        'ingreso' as type,
        p.created_at as date,
        COALESCE(s.invoice_number, CONCAT('PAY-', p.id)) as reference,
        COALESCE(c.name, 'Pago de venta') as concept,
        (p.amount * COALESCE(p.exchange_rate, 1)) as amount_local,
        p.amount as amount_base,
        COALESCE(p.exchange_rate, 1) as rate,
        p.reference_number as doc_ref,
        p.notes,
        'activo' as status
      FROM payments p
      LEFT JOIN sales s ON s.id = p.sale_id
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.payment_journal_id = :id ${datePay} ${tc}

      UNION ALL

      SELECT
        e.id,
        'egreso' as type,
        e.created_at as date,
        COALESCE(e.reference, CONCAT('EGR-', e.id)) as reference,
        e.description as concept,
        (e.amount * COALESCE(e.rate, 1)) as amount_local,
        e.amount as amount_base,
        COALESCE(e.rate, 1) as rate,
        NULL as doc_ref,
        e.notes,
        e.status
      FROM expenses e
      WHERE e.payment_journal_id = :id ${dateExp} ${te}
    ) AS movements
    ORDER BY date ASC
    LIMIT :limit OFFSET :offset
  `, {
    replacements: { id, limit: parseInt(limit), offset: parseInt(offset) },
    type: Sequelize.QueryTypes.SELECT,
  });

  let runningBalance = 0;
  if (date_from) {
    const [prevBal] = await sequelize.query(`
      SELECT (
        COALESCE((SELECT SUM(amount * COALESCE(exchange_rate, 1)) FROM payments WHERE created_at < :date_from ${tp}), 0)
        -
        COALESCE((SELECT SUM(amount * COALESCE(rate, 1)) FROM expenses WHERE status = 'activo' AND created_at < :date_from ${texp}), 0)
      ) as balance
    `, { replacements: { id, date_from }, type: Sequelize.QueryTypes.SELECT });
    runningBalance = parseFloat(prevBal?.balance || 0);
  }

  const data = rows.map(row => {
    const localAmt = parseFloat(row.amount_local || 0);
    if (row.type === 'ingreso') {
      runningBalance += localAmt;
    } else if (row.status === 'activo') {
      runningBalance -= localAmt;
    }
    return {
      ...row,
      amount_local: localAmt,
      amount_base:  parseFloat(row.amount_base || 0),
      rate:         parseFloat(row.rate || 1),
      balance:      runningBalance,
    };
  });

  const jj = journal.get({ plain: true });
  return {
    journal: {
      id:              jj.id,
      name:            jj.name,
      color:           jj.color,
      currency_code:   jj.Currency?.code   || null,
      currency_symbol: jj.Currency?.symbol || '$',
      bank_name:       jj.Bank?.name       || null,
    },
    data,
    total: parseInt(countResult?.total || 0),
  };
}

module.exports = { getAll, createJournal, updateJournal, deleteJournal, getSummary, getMovements };
