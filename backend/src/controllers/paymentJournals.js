const { PaymentJournal, Currency, Bank, Sale, Sequelize } = require("../models");

// GET /api/payment-journals
const getAll = async (req, res) => {
  try {
    const company_id = req.employee?.company_id ?? null;
    const isSuperuser = !!req.is_superuser;
    const tenantWhere = (!isSuperuser && company_id) ? { company_id } : {};
    const journals = await PaymentJournal.findAll({
      where: tenantWhere,
      include: [
        { model: Currency, attributes: ['code', 'symbol', 'is_base'], required: false },
        { model: Bank, attributes: ['name'], required: false }
      ],
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });

    const data = journals.map(j => {
      const jj = j.toJSON();
      jj.currency_code    = jj.Currency?.code    ?? null;
      jj.currency_symbol  = jj.Currency?.symbol  ?? null;
      jj.currency_is_base = jj.Currency?.is_base ?? null;
      jj.bank_name        = jj.Bank?.name        ?? null;
      delete jj.Currency;
      delete jj.Bank;
      return jj;
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener diarios" });
  }
};

// POST /api/payment-journals
const create = async (req, res) => {
  try {
    const { name, type, bank_id, color, sort_order, currency_id } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const journal = await PaymentJournal.create({
      name,
      type: type || null,
      bank_id: bank_id || null,
      color: color || "#555555",
      sort_order: sort_order ?? 0,
      currency_id: currency_id || null
    });

    res.status(201).json({ ok: true, data: journal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear diario" });
  }
};

// PUT /api/payment-journals/:id
const update = async (req, res) => {
  try {
    const { name, type, bank_id, color, active, sort_order, currency_id } = req.body;
    const journal = await PaymentJournal.findByPk(req.params.id);
    if (!journal) return res.status(404).json({ ok: false, message: "Diario no encontrado" });

    await journal.update({
      name,
      type: type || null,
      bank_id: bank_id || null,
      color: color || "#555555",
      active: active ?? true,
      sort_order: sort_order ?? 0,
      currency_id: currency_id || null
    });

    res.json({ ok: true, data: journal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar diario" });
  }
};

// DELETE /api/payment-journals/:id
const remove = async (req, res) => {
  try {
    const count = await Sale.count({ where: { payment_journal_id: req.params.id } });
    if (count > 0) return res.status(400).json({ ok: false, message: "No se puede eliminar: tiene ventas asociadas" });

    const journal = await PaymentJournal.findByPk(req.params.id);
    if (!journal) return res.status(404).json({ ok: false, message: "Diario no encontrado" });

    await journal.destroy();
    res.json({ ok: true, message: "Diario eliminado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar diario" });
  }
};

// GET /api/payment-journals/summary
// Suma los PAGOS (tabla payments) agrupados por diario, convirtiendo a la moneda del diario
const summary = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const company_id = req.employee?.company_id ?? null;
    const isSuperuser = !!req.is_superuser;
    const tc = (!isSuperuser && company_id) ? `AND p.company_id = ${parseInt(company_id)}` : '';
    const tce = (!isSuperuser && company_id) ? `AND e.company_id = ${parseInt(company_id)}` : '';
    const tenantWhere = (!isSuperuser && company_id) ? { company_id } : {};

    const pDateClause = date_from && date_to
      ? `AND p."created_at" >= '${date_from}' AND p."created_at" < ('${date_to}'::date + INTERVAL '1 day')`
      : (date_from ? `AND p."created_at" >= '${date_from}'` : (date_to ? `AND p."created_at" < ('${date_to}'::date + INTERVAL '1 day')` : ''));

    const eDateClause = date_from && date_to
      ? `AND e."created_at" >= '${date_from}' AND e."created_at" < ('${date_to}'::date + INTERVAL '1 day')`
      : (date_from ? `AND e."created_at" >= '${date_from}'` : (date_to ? `AND e."created_at" < ('${date_to}'::date + INTERVAL '1 day')` : ''));

    const journals = await PaymentJournal.findAll({
      attributes: [
        'id', 'name', 'type', 'bank_id', 'color', 'currency_id',
        [Sequelize.literal(`(
          SELECT COUNT(id) FROM payments p WHERE p.payment_journal_id = "PaymentJournal".id ${pDateClause} ${tc}
        )`), 'tx_count'],
        [Sequelize.literal(`(
          (SELECT COALESCE(SUM("amount" * COALESCE("exchange_rate", 1)), 0) FROM payments p WHERE p.payment_journal_id = "PaymentJournal".id ${pDateClause} ${tc})
          -
          (SELECT COALESCE(SUM("amount" * COALESCE("rate", 1)), 0) FROM expenses e WHERE e.payment_journal_id = "PaymentJournal".id AND e.status = 'activo' ${eDateClause} ${tce})
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

    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener resumen" });
  }
};

// GET /api/payment-journals/:id/movements
// Estado de cuenta: extracto bancario con saldo acumulado
const movements = async (req, res) => {
  try {
    const { id } = req.params;
    const { date_from, date_to, limit = 200, offset = 0 } = req.query;
    const { sequelize } = require("../models");

    // Verificar que el diario existe
    const journal = await PaymentJournal.findByPk(id, {
      include: [
        { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'] },
        { model: Bank, attributes: ['name'] },
      ],
    });
    if (!journal) return res.status(404).json({ ok: false, message: "Diario no encontrado" });

    const company_id = req.employee?.company_id ?? null;
    const isSuperuser = !!req.is_superuser;
    const tc = (!isSuperuser && company_id) ? ` AND p.company_id = ${parseInt(company_id)}` : '';
    const te = (!isSuperuser && company_id) ? ` AND e.company_id = ${parseInt(company_id)}` : '';
    const tp = (!isSuperuser && company_id) ? ` AND payment_journal_id = :id AND company_id = ${parseInt(company_id)}` : ' AND payment_journal_id = :id';
    const texp = (!isSuperuser && company_id) ? ` AND payment_journal_id = :id AND company_id = ${parseInt(company_id)}` : ' AND payment_journal_id = :id';

    // Construir cláusulas de fecha
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

    // Contar el total para paginación
    const [countResult] = await sequelize.query(`
      SELECT (
        (SELECT COUNT(*) FROM payments p WHERE p.payment_journal_id = :id ${datePay} ${tc})
        +
        (SELECT COUNT(*) FROM expenses e WHERE e.payment_journal_id = :id ${dateExp} ${te})
      ) as total
    `, { replacements: { id }, type: Sequelize.QueryTypes.SELECT });

    // UNION de pagos (ingresos) y egresos, ordenados cronológicamente
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

    // Calcular saldo acumulado progresivo
    // Primero calcular el saldo previo al offset (si hay paginación)
    let prevBalance = 0;
    if (parseInt(offset) > 0) {
      const [prev] = await sequelize.query(`
        SELECT (
          (SELECT COALESCE(SUM(amount * COALESCE(exchange_rate, 1)), 0) FROM payments WHERE 1=1 ${tp})
          -
          (SELECT COALESCE(SUM(amount * COALESCE(rate, 1)), 0) FROM expenses WHERE status = 'activo' ${texp})
        ) as balance
      `, { replacements: { id }, type: Sequelize.QueryTypes.SELECT });
      prevBalance = parseFloat(prev?.balance || 0);
    }

    // Calcular saldo corriente
    let runningBalance = 0;
    // Para saldo acumulado desde el inicio: obtenemos saldo previo a la primera fecha
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

    const movementsWithBalance = rows.map(row => {
      const localAmt = parseFloat(row.amount_local || 0);
      if (row.type === 'ingreso') {
        runningBalance += localAmt;
      } else if (row.status === 'activo') {
        runningBalance -= localAmt;
      }
      // Los anulados no afectan el saldo
      return {
        ...row,
        amount_local: localAmt,
        amount_base: parseFloat(row.amount_base || 0),
        rate: parseFloat(row.rate || 1),
        balance: runningBalance,
      };
    });

    const jj = journal.get({ plain: true });

    res.json({
      ok: true,
      journal: {
        id: jj.id,
        name: jj.name,
        color: jj.color,
        currency_code: jj.Currency?.code || null,
        currency_symbol: jj.Currency?.symbol || '$',
        bank_name: jj.Bank?.name || null,
      },
      data: movementsWithBalance,
      total: parseInt(countResult?.total || 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener movimientos" });
  }
};

module.exports = { getAll, create, update, remove, summary, movements };
