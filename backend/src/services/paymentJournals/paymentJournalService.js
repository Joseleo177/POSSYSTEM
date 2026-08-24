const { PaymentJournal, Currency, Bank, Sale, Warehouse, Sequelize, sequelize } = require("../../models");
const { localDate, TZ } = require("../reports/shared");
const { visibleWarehouseIds, isAdmin, assertWarehouseAccess } = require("../../middleware/auth");

function flattenJournal(j) {
  const jj = j.toJSON ? j.toJSON() : j;
  jj.currency_code    = jj.Currency?.code     ?? null;
  jj.currency_symbol  = jj.Currency?.symbol   ?? null;
  jj.currency_is_base = jj.Currency?.is_base  ?? null;
  // Sin la tasa, quien registra un egreso o ingreso en un diario en bolívares no podía
  // convertir el monto a base: se guardaba el importe en Bs. como si fueran Ref. y con
  // rate 1. getSummary ya la exponía; getAll debe hacerlo igual.
  jj.exchange_rate    = jj.Currency?.exchange_rate ?? 1;
  jj.bank_name        = jj.Bank?.name         ?? null;
  jj.warehouse_name   = jj.Warehouse?.name    ?? null;
  delete jj.Currency; delete jj.Bank; delete jj.Warehouse;
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

// El diario (caja, banco) es de la empresa, pero lo que entra y sale de él ocurre en una
// sucursal. Sin este recorte, el Estado de Cuenta mostraba a cualquier gerente el saldo
// consolidado del negocio completo.
//
// Un cobro no guarda sucursal —la hereda de su venta—, así que se filtra por el join con
// sales; los ingresos y egresos sí tienen almacén propio.
// Las variantes `*Bare` son para las consultas de saldo, que van contra la tabla sin alias
// ni join: ahí el almacén del cobro se resuelve con una subconsulta sobre sales.
async function warehouseFilter(req) {
  const allowed = await visibleWarehouseIds(req);
  if (allowed === null) {                                          // admin: sin recorte
    return { whP: '', whI: '', whE: '', whPBare: '', whIBare: '', whEBare: '', whPCount: '' };
  }

  const ids = allowed.filter(Number.isInteger);
  if (!ids.length) {
    const no = 'AND FALSE';
    return { whP: no, whI: no, whE: no, whPBare: no, whIBare: no, whEBare: no, whPCount: no };
  }

  const list = ids.join(',');
  return {
    whP: `AND s.warehouse_id IN (${list})`,
    whI: `AND i.warehouse_id IN (${list})`,
    whE: `AND e.warehouse_id IN (${list})`,
    whPBare: `AND sale_id IN (SELECT id FROM sales WHERE warehouse_id IN (${list}))`,
    whPCount: `AND p.sale_id IN (SELECT id FROM sales WHERE warehouse_id IN (${list}))`,
    whIBare: `AND warehouse_id IN (${list})`,
    whEBare: `AND warehouse_id IN (${list})`,
  };
}

// Qué diarios ve un empleado: los de sus sucursales más los compartidos (warehouse_id NULL),
// que son los que sirven a toda la empresa. El admin los ve todos.
async function journalScope(req) {
  const allowed = await visibleWarehouseIds(req);
  if (allowed === null) return {};
  return {
    [Sequelize.Op.or]: [
      { warehouse_id: null },
      { warehouse_id: { [Sequelize.Op.in]: allowed } },
    ],
  };
}

// Un diario solo se puede crear o editar sobre una sucursal propia. `null` (compartido) es
// cosa del admin: afecta a todas las sucursales, no solo a la suya.
// Un depósito no atiende público ni cobra: una caja ahí no recibiría nunca un peso. Se
// valida en el servidor y no solo en el selector, para que el criterio valga también si el
// diario se crea por API.
async function assertNoEsDeposito(warehouseId) {
  if (!warehouseId) return;
  const almacen = await Warehouse.findByPk(warehouseId, { attributes: ['id', 'name', 'sells'] });
  if (almacen && almacen.sells === false) {
    const e = new Error(`${almacen.name} es un depósito: no maneja caja`);
    e.status = 400; e.isOperational = true; throw e;
  }
}

async function assertJournalWarehouse(req, warehouseId) {
  await assertNoEsDeposito(warehouseId);
  if (isAdmin(req)) return warehouseId ? parseInt(warehouseId) : null;

  const allowed = await visibleWarehouseIds(req);
  if (!warehouseId) {
    // Sin sucursal elegida se cae en la del propio empleado; si tiene varias, hay que decidir.
    if (allowed.length === 1) return allowed[0];
    const e = new Error("Indica la sucursal a la que pertenece el diario"); e.status = 400; e.isOperational = true; throw e;
  }
  const wid = parseInt(warehouseId);
  if (!allowed.includes(wid)) {
    const e = new Error("No tienes acceso a esa sucursal"); e.status = 403; e.isOperational = true; throw e;
  }
  return wid;
}

async function getAll(req) {
  const { tenantWhere } = tenantFilter(req);
  const journals = await PaymentJournal.findAll({
    where: { ...tenantWhere, ...(await journalScope(req)) },
    include: [
      { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'], required: false },
      { model: Bank,     attributes: ['name'],                                        required: false },
      { model: Warehouse, attributes: ['id', 'name'],                                 required: false }
    ],
    order: [['sort_order', 'ASC'], ['id', 'ASC']]
  });
  return { data: journals.map(flattenJournal) };
}

async function createJournal({ name, type, bank_id, color, sort_order, currency_id, warehouse_id }, req) {
  if (!name) { const e = new Error("El nombre es requerido"); e.status = 400; throw e; }
  const wid = await assertJournalWarehouse(req, warehouse_id);
  const journal = await PaymentJournal.create({
    name,
    warehouse_id: wid,
    type:        type        || null,
    bank_id:     bank_id     || null,
    color:       color       || "#555555",
    sort_order:  sort_order  ?? 0,
    currency_id: currency_id || null
  });
  return { data: journal };
}

async function updateJournal(id, { name, type, bank_id, color, active, sort_order, currency_id, warehouse_id }, req) {
  const journal = await PaymentJournal.findByPk(id);
  if (!journal) { const e = new Error("Diario no encontrado"); e.status = 404; throw e; }
  // No se edita un diario de otra sucursal; los compartidos son del admin.
  await assertWarehouseAccess(req, journal.warehouse_id, { optional: true });
  const wid = warehouse_id !== undefined ? await assertJournalWarehouse(req, warehouse_id) : journal.warehouse_id;
  await journal.update({
    name,
    warehouse_id: wid,
    type:        type        || null,
    bank_id:     bank_id     || null,
    color:       color       || "#555555",
    active:      active      ?? true,
    sort_order:  sort_order  ?? 0,
    currency_id: currency_id || null
  });
  return { data: journal };
}

async function deleteJournal(id, req) {
  const count = await Sale.count({ where: { payment_journal_id: id } });
  if (count > 0) { const e = new Error("No se puede eliminar: tiene ventas asociadas"); e.status = 400; throw e; }
  const journal = await PaymentJournal.findByPk(id);
  if (!journal) { const e = new Error("Diario no encontrado"); e.status = 404; throw e; }
  await assertWarehouseAccess(req, journal.warehouse_id, { optional: true });
  await journal.destroy();
  return { message: "Diario eliminado" };
}

async function getSummary(req) {
  const { date_from, date_to } = req.query;
  const { tenantWhere, tc, tce } = tenantFilter(req);
  const { whP, whI, whE } = await warehouseFilter(req);
  const company_id  = req.employee?.company_id ?? null;
  const tci = company_id ? `AND i.company_id = ${parseInt(company_id)}` : '';

  // El filtro de rango y el "hoy" de abajo deben cortar el día igual. Antes el rango
  // comparaba contra literales sin convertir (día UTC) mientras el "hoy" ya usaba hora
  // local, así que un cobro de las 9 PM aparecía en una cifra y no en la otra.
  const sd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const safeFrom = sd(date_from);
  const safeTo   = sd(date_to);

  const buildDateClause = (alias) => {
    const col = localDate(`${alias}."created_at"`);
    let clause = '';
    if (safeFrom) clause += ` AND ${col} >= '${safeFrom}'::date`;
    if (safeTo)   clause += ` AND ${col} <= '${safeTo}'::date`;
    return clause;
  };
  const pDate = buildDateClause('p');
  const eDate = buildDateClause('e');
  const iDate = buildDateClause('i');

  const todayLocal = `(NOW() AT TIME ZONE '${TZ}')::date`;
  const todayP = `${localDate('p.created_at')} = ${todayLocal}`;
  const todayE = `${localDate('e.created_at')} = ${todayLocal}`;
  const todayI = `${localDate('i.created_at')} = ${todayLocal}`;

  const journals = await PaymentJournal.findAll({
    attributes: [
      'id', 'name', 'type', 'bank_id', 'color', 'currency_id',
      [Sequelize.literal(`(
        SELECT COUNT(p.id) FROM payments p
        LEFT JOIN sales s ON p.sale_id = s.id
        WHERE p.payment_journal_id = "PaymentJournal".id ${pDate} ${tc} ${whP}
      )`), 'tx_count'],
      [Sequelize.literal(`(
        (SELECT COALESCE(SUM(p."amount" * COALESCE(p."exchange_rate", 1)), 0)
         FROM payments p LEFT JOIN sales s ON p.sale_id = s.id
         WHERE p.payment_journal_id = "PaymentJournal".id ${pDate} ${tc} ${whP})
        +
        (SELECT COALESCE(SUM(i."amount" * COALESCE(i."rate", 1)), 0) FROM incomes i
         WHERE i.payment_journal_id = "PaymentJournal".id AND i.status = 'activo' ${iDate} ${tci} ${whI})
        -
        (SELECT COALESCE(SUM(e."amount" * COALESCE(e."rate", 1)), 0) FROM expenses e
         WHERE e.payment_journal_id = "PaymentJournal".id AND e.status = 'activo' ${eDate} ${tce} ${whE})
      )`), 'total_ingresos'],
      [Sequelize.literal(`(
        (SELECT COALESCE(SUM(p."amount" * COALESCE(p."exchange_rate", 1)), 0)
         FROM payments p LEFT JOIN sales s ON p.sale_id = s.id
         WHERE p.payment_journal_id = "PaymentJournal".id AND ${todayP} ${tc} ${whP})
        +
        (SELECT COALESCE(SUM(i."amount" * COALESCE(i."rate", 1)), 0) FROM incomes i
         WHERE i.payment_journal_id = "PaymentJournal".id AND i.status = 'activo' AND ${todayI} ${tci} ${whI})
        -
        (SELECT COALESCE(SUM(e."amount" * COALESCE(e."rate", 1)), 0) FROM expenses e
         WHERE e.payment_journal_id = "PaymentJournal".id AND e.status = 'activo' AND ${todayE} ${tce} ${whE})
      )`), 'ingresos_hoy'],
    ],
    include: [
      { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'], required: false },
      { model: Bank,     attributes: ['name'],                                        required: false }
    ],
    where: { active: true, ...tenantWhere, ...(await journalScope(req)) },
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
  const { whP, whI, whE, whPBare, whIBare, whEBare, whPCount } = await warehouseFilter(req);

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
  // Un diario de otra sucursal no se abre ni para mirar: sus movimientos son su caja.
  await assertWarehouseAccess(req, journal.warehouse_id, { optional: true });

  const sd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const safeFrom = sd(date_from);
  const safeTo   = sd(date_to);

  // reference_date es DATE (fecha local ya elegida por el cajero); date y created_at son
  // TIMESTAMPTZ y hay que llevarlos a fecha local antes de comparar. Sin esto el día de
  // corte de un pago con referencia y el de uno sin ella no eran el mismo.
  const payDay = `COALESCE(p.reference_date, ${localDate('p.created_at')})`;
  const expDay = localDate('COALESCE(e.date, e.created_at)');
  const incDay = localDate('COALESCE(i.date, i.created_at)');

  let datePay = '';
  let dateExp = '';
  let dateInc = '';
  if (safeFrom) {
    datePay += ` AND ${payDay} >= '${safeFrom}'::date`;
    dateExp += ` AND ${expDay} >= '${safeFrom}'::date`;
    dateInc += ` AND ${incDay} >= '${safeFrom}'::date`;
  }
  if (safeTo) {
    datePay += ` AND ${payDay} <= '${safeTo}'::date`;
    dateExp += ` AND ${expDay} <= '${safeTo}'::date`;
    dateInc += ` AND ${incDay} <= '${safeTo}'::date`;
  }

  // Saldo real del diario — incluye payments (ventas) + incomes (manuales) - expenses
  const [currBal] = await sequelize.query(`
    SELECT (
      COALESCE((SELECT SUM(amount * COALESCE(exchange_rate, 1)) FROM payments WHERE TRUE ${tp} ${whPBare}), 0)
      + COALESCE((SELECT SUM(amount * COALESCE(rate, 1))        FROM incomes  WHERE status = 'activo' AND TRUE ${ti} ${whIBare}), 0)
      - COALESCE((SELECT SUM(amount * COALESCE(rate, 1))        FROM expenses WHERE status = 'activo' AND TRUE ${texp} ${whEBare}), 0)
    ) as balance
  `, { replacements: { id }, type: Sequelize.QueryTypes.SELECT });
  const currentBalance = parseFloat(currBal?.balance || 0);

  const [countResult] = await sequelize.query(`
    SELECT (
      -- Un cobro conjunto es una sola línea en el listado, así que también cuenta como una
      -- sola para la paginación; si no, la última página quedaba vacía.
      (SELECT COUNT(DISTINCT COALESCE(p.batch_id, CONCAT('p', p.id))) FROM payments p
        WHERE p.payment_journal_id = :id ${datePay} ${tc} ${whPCount})
      +
      (SELECT COUNT(*) FROM incomes  i WHERE i.payment_journal_id = :id AND i.status = 'activo' ${dateInc} ${tci} ${whI})
      +
      (SELECT COUNT(*) FROM expenses e WHERE e.payment_journal_id = :id AND e.status = 'activo' ${dateExp} ${te} ${whE})
    ) as total
  `, { replacements: { id }, type: Sequelize.QueryTypes.SELECT });

  // Saldo de arrastre: todo lo ocurrido ANTES de date_from (si hay filtro de fecha)
  let preBalance = 0;
  if (safeFrom) {
    const [prevBal] = await sequelize.query(`
      SELECT (
        COALESCE((SELECT SUM(amount * COALESCE(exchange_rate, 1)) FROM payments WHERE COALESCE(reference_date, ${localDate('created_at')}) < :date_from ${tp} ${whPBare}), 0)
        + COALESCE((SELECT SUM(amount * COALESCE(rate, 1)) FROM incomes  WHERE status = 'activo' AND ${localDate('COALESCE(date, created_at)')} < :date_from ${ti} ${whIBare}), 0)
        - COALESCE((SELECT SUM(amount * COALESCE(rate, 1)) FROM expenses WHERE status = 'activo' AND ${localDate('COALESCE(date, created_at)')} < :date_from ${texp} ${whEBare}), 0)
      ) as balance
    `, { replacements: { id, date_from: safeFrom }, type: Sequelize.QueryTypes.SELECT });
    preBalance = parseFloat(prevBal?.balance || 0);
  }

  // Window function calcula el saldo acumulado en orden ASC; el query externo ordena DESC y pagina.
  // created_at se usa como tiebreaker para evitar orden arbitrario cuando dos movimientos comparten fecha.
  const rows = await sequelize.query(`
    SELECT * FROM (
      SELECT *,
        SUM(CASE WHEN type = 'ingreso' THEN amount_local ELSE -amount_local END)
          OVER (ORDER BY date ASC, created_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
          + :pre_balance AS balance
      FROM (
        SELECT
          p.id,
          'ingreso'                                               AS type,
          COALESCE(p.reference_date, p.created_at)              AS date,
          p.created_at                                           AS created_at,
          COALESCE(s.invoice_number, CONCAT('PAY-', p.id))      AS reference,
          COALESCE(c.name, 'Pago de venta')                     AS concept,
          (p.amount * COALESCE(p.exchange_rate, 1))             AS amount_local,
          p.amount                                               AS amount_base,
          COALESCE(p.exchange_rate, 1)                          AS rate,
          p.reference_number                                     AS doc_ref,
          p.notes,
          1                                                      AS group_count,
          'activo'                                               AS status
        FROM payments p
        LEFT JOIN sales s     ON s.id = p.sale_id
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.payment_journal_id = :id AND p.batch_id IS NULL ${datePay} ${tc} ${whP}

        UNION ALL

        -- Cobro conjunto: varias facturas saldadas con un solo monto. Va como UNA línea, por
        -- su total. La caja se cuadra contra lo que entró físicamente, y lo que entró fue un
        -- pago; desglosarlo por factura acá obligaba a sumar a mano tres importes sueltos
        -- para reconocer el billete que recibió el cajero. El detalle por factura sigue
        -- entero en la tabla y en el módulo de Pagos.
        SELECT
          MIN(p.id)                                              AS id,
          'ingreso'                                               AS type,
          MIN(COALESCE(p.reference_date, p.created_at))         AS date,
          MIN(p.created_at)                                      AS created_at,
          string_agg(COALESCE(s.invoice_number, CONCAT('#', p.sale_id)), ' · '
                     ORDER BY s.invoice_number)                  AS reference,
          COALESCE(MIN(c.name), 'Pago de venta')                AS concept,
          SUM(p.amount * COALESCE(p.exchange_rate, 1))          AS amount_local,
          SUM(p.amount)                                          AS amount_base,
          MAX(COALESCE(p.exchange_rate, 1))                     AS rate,
          MIN(p.reference_number)                                AS doc_ref,
          MIN(p.notes)                                           AS notes,
          COUNT(*)::int                                          AS group_count,
          'activo'                                               AS status
        FROM payments p
        LEFT JOIN sales s     ON s.id = p.sale_id
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.payment_journal_id = :id AND p.batch_id IS NOT NULL ${datePay} ${tc} ${whP}
        GROUP BY p.batch_id

        UNION ALL

        SELECT
          i.id,
          'ingreso'                                               AS type,
          COALESCE(i.date, i.created_at)                        AS date,
          i.created_at                                           AS created_at,
          COALESCE(i.reference, CONCAT('INC-', i.id))           AS reference,
          i.description                                          AS concept,
          (i.amount * COALESCE(i.rate, 1))                      AS amount_local,
          i.amount                                               AS amount_base,
          COALESCE(i.rate, 1)                                    AS rate,
          NULL                                                   AS doc_ref,
          i.notes,
          1                                                      AS group_count,
          i.status
        FROM incomes i
        WHERE i.payment_journal_id = :id AND i.status = 'activo' ${dateInc} ${tci} ${whI}

        UNION ALL

        SELECT
          e.id,
          'egreso'                                               AS type,
          COALESCE(e.date, e.created_at)                        AS date,
          e.created_at                                           AS created_at,
          COALESCE(e.reference, CONCAT('EGR-', e.id))          AS reference,
          e.description                                          AS concept,
          (e.amount * COALESCE(e.rate, 1))                     AS amount_local,
          e.amount                                               AS amount_base,
          COALESCE(e.rate, 1)                                   AS rate,
          NULL                                                   AS doc_ref,
          e.notes,
          1                                                      AS group_count,
          e.status
        FROM expenses e
        WHERE e.payment_journal_id = :id AND e.status = 'activo' ${dateExp} ${te} ${whE}
      ) all_movements
    ) with_balance
    ORDER BY date DESC, created_at DESC
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
    // >1 cuando la línea resume un cobro conjunto: la caja recibió un solo monto por
    // varias facturas.
    group_count:  parseInt(row.group_count || 1, 10),
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

async function getBankMovements(req) {
  const { bankId } = req.params;
  const { date_from, date_to, limit = 200, offset = 0 } = req.query;
  const company_id = req.employee?.company_id ?? null;
  const scoped = !!company_id;

  // Todos los diarios activos del banco (filtrado por empresa y por sucursal: un banco
  // puede tener cajas de varias tiendas y cada una solo suma las suyas)
  const bankJournals = await PaymentJournal.findAll({
    where: { bank_id: bankId, active: true, ...(scoped ? { company_id } : {}), ...(await journalScope(req)) },
    include: [
      { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'] },
      { model: Bank,     attributes: ['name', 'id'] },
    ],
  });

  if (!bankJournals.length) {
    const e = new Error("Banco sin diarios activos"); e.status = 404; throw e;
  }

  const jList  = bankJournals.map(j => j.id).join(',');
  const first  = bankJournals[0].get({ plain: true });
  const tcBase = scoped ? `AND company_id = ${parseInt(company_id)}` : '';
  const tp     = ` AND payment_journal_id IN (${jList}) ${tcBase}`;
  const tc     = scoped ? `AND p.company_id = ${parseInt(company_id)}` : '';
  const tci    = scoped ? `AND i.company_id = ${parseInt(company_id)}` : '';
  const te     = scoped ? `AND e.company_id = ${parseInt(company_id)}` : '';
  const { whP, whI, whE, whPBare, whIBare, whEBare, whPCount } = await warehouseFilter(req);

  const sd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const safeFrom = sd(date_from);
  const safeTo   = sd(date_to);

  const payDay = `COALESCE(p.reference_date, ${localDate('p.created_at')})`;
  const expDay = localDate('COALESCE(e.date, e.created_at)');
  const incDay = localDate('COALESCE(i.date, i.created_at)');

  let datePay = '', dateExp = '', dateInc = '';
  if (safeFrom) {
    datePay += ` AND ${payDay} >= '${safeFrom}'::date`;
    dateExp += ` AND ${expDay} >= '${safeFrom}'::date`;
    dateInc += ` AND ${incDay} >= '${safeFrom}'::date`;
  }
  if (safeTo) {
    datePay += ` AND ${payDay} <= '${safeTo}'::date`;
    dateExp += ` AND ${expDay} <= '${safeTo}'::date`;
    dateInc += ` AND ${incDay} <= '${safeTo}'::date`;
  }

  const [currBal] = await sequelize.query(`
    SELECT (
      COALESCE((SELECT SUM(amount * COALESCE(exchange_rate, 1)) FROM payments WHERE TRUE ${tp} ${whPBare}), 0)
      + COALESCE((SELECT SUM(amount * COALESCE(rate, 1))        FROM incomes  WHERE status = 'activo' AND TRUE ${tp} ${whIBare}), 0)
      - COALESCE((SELECT SUM(amount * COALESCE(rate, 1))        FROM expenses WHERE status = 'activo' AND TRUE ${tp} ${whEBare}), 0)
    ) as balance
  `, { type: Sequelize.QueryTypes.SELECT });
  const currentBalance = parseFloat(currBal?.balance || 0);

  const [countResult] = await sequelize.query(`
    SELECT (
      (SELECT COUNT(DISTINCT COALESCE(p.batch_id, CONCAT('p', p.id))) FROM payments p WHERE p.payment_journal_id IN (${jList}) ${datePay} ${tc} ${whPCount})
      + (SELECT COUNT(*) FROM incomes  i WHERE i.payment_journal_id IN (${jList}) AND i.status = 'activo' ${dateInc} ${tci} ${whI})
      + (SELECT COUNT(*) FROM expenses e WHERE e.payment_journal_id IN (${jList}) AND e.status = 'activo' ${dateExp} ${te} ${whE})
    ) as total
  `, { type: Sequelize.QueryTypes.SELECT });

  let preBalance = 0;
  if (safeFrom) {
    const [prevBal] = await sequelize.query(`
      SELECT (
        COALESCE((SELECT SUM(amount * COALESCE(exchange_rate, 1)) FROM payments WHERE COALESCE(reference_date, ${localDate('created_at')}) < '${safeFrom}'::date ${tp} ${whPBare}), 0)
        + COALESCE((SELECT SUM(amount * COALESCE(rate, 1)) FROM incomes  WHERE status = 'activo' AND ${localDate('COALESCE(date, created_at)')} < '${safeFrom}'::date ${tp} ${whIBare}), 0)
        - COALESCE((SELECT SUM(amount * COALESCE(rate, 1)) FROM expenses WHERE status = 'activo' AND ${localDate('COALESCE(date, created_at)')} < '${safeFrom}'::date ${tp} ${whEBare}), 0)
      ) as balance
    `, { type: Sequelize.QueryTypes.SELECT });
    preBalance = parseFloat(prevBal?.balance || 0);
  }

  const rows = await sequelize.query(`
    SELECT * FROM (
      SELECT *,
        SUM(CASE WHEN type = 'ingreso' THEN amount_local ELSE -amount_local END)
          OVER (ORDER BY date ASC, created_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
          + ${preBalance} AS balance
      FROM (
        SELECT p.id, 'ingreso' AS type, COALESCE(p.reference_date, p.created_at) AS date,
          p.created_at                                      AS created_at,
          COALESCE(s.invoice_number, CONCAT('PAY-', p.id)) AS reference,
          COALESCE(c.name, 'Pago de venta')                AS concept,
          (p.amount * COALESCE(p.exchange_rate, 1))        AS amount_local,
          p.amount                                          AS amount_base,
          COALESCE(p.exchange_rate, 1)                     AS rate,
          p.reference_number                                AS doc_ref,
          p.notes, 1 AS group_count, 'activo'               AS status
        FROM payments p
        LEFT JOIN sales s     ON s.id = p.sale_id
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.payment_journal_id IN (${jList}) AND p.batch_id IS NULL ${datePay} ${tc} ${whP}

        UNION ALL

        -- Cobro conjunto: una línea por lote, igual que en el diario (ver getMovements).
        SELECT MIN(p.id) AS id, 'ingreso' AS type,
          MIN(COALESCE(p.reference_date, p.created_at))    AS date,
          MIN(p.created_at)                                 AS created_at,
          string_agg(COALESCE(s.invoice_number, CONCAT('#', p.sale_id)), ' · '
                     ORDER BY s.invoice_number)             AS reference,
          COALESCE(MIN(c.name), 'Pago de venta')           AS concept,
          SUM(p.amount * COALESCE(p.exchange_rate, 1))     AS amount_local,
          SUM(p.amount)                                     AS amount_base,
          MAX(COALESCE(p.exchange_rate, 1))                AS rate,
          MIN(p.reference_number)                           AS doc_ref,
          MIN(p.notes) AS notes, COUNT(*)::int AS group_count, 'activo' AS status
        FROM payments p
        LEFT JOIN sales s     ON s.id = p.sale_id
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.payment_journal_id IN (${jList}) AND p.batch_id IS NOT NULL ${datePay} ${tc} ${whP}
        GROUP BY p.batch_id

        UNION ALL

        SELECT i.id, 'ingreso' AS type, COALESCE(i.date, i.created_at) AS date,
          i.created_at                                 AS created_at,
          COALESCE(i.reference, CONCAT('INC-', i.id)) AS reference,
          i.description AS concept,
          (i.amount * COALESCE(i.rate, 1)) AS amount_local,
          i.amount AS amount_base, COALESCE(i.rate, 1) AS rate,
          NULL AS doc_ref, i.notes, 1 AS group_count, i.status
        FROM incomes i
        WHERE i.payment_journal_id IN (${jList}) AND i.status = 'activo' ${dateInc} ${tci} ${whI}

        UNION ALL

        SELECT e.id, 'egreso' AS type, COALESCE(e.date, e.created_at) AS date,
          e.created_at                                 AS created_at,
          COALESCE(e.reference, CONCAT('EGR-', e.id)) AS reference,
          e.description AS concept,
          (e.amount * COALESCE(e.rate, 1)) AS amount_local,
          e.amount AS amount_base, COALESCE(e.rate, 1) AS rate,
          NULL AS doc_ref, e.notes, 1 AS group_count, e.status
        FROM expenses e
        WHERE e.payment_journal_id IN (${jList}) AND e.status = 'activo' ${dateExp} ${te} ${whE}
      ) all_movements
    ) with_balance
    ORDER BY date DESC, created_at DESC
    LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
  `, { type: Sequelize.QueryTypes.SELECT });

  return {
    journal: {
      id:              null,
      name:            first.Bank?.name || 'Banco',
      color:           first.color,
      currency_code:   first.Currency?.code   || null,
      currency_symbol: first.Currency?.symbol || 'Ref.',
      bank_name:       first.Bank?.name       || null,
      current_balance: currentBalance,
    },
    data: rows.map(row => ({
      ...row,
      amount_local: parseFloat(row.amount_local || 0),
      amount_base:  parseFloat(row.amount_base  || 0),
      rate:         parseFloat(row.rate         || 1),
      balance:      parseFloat(row.balance      || 0),
    })),
    total: parseInt(countResult?.total || 0),
  };
}

module.exports = { getAll, createJournal, updateJournal, deleteJournal, getSummary, getMovements, getBankMovements };
