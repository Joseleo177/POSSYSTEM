const { PaymentJournal, Currency, Bank, Sale, Payment, Sequelize } = require("../models");
const { Op } = Sequelize;

// GET /api/payment-journals
const getAll = async (req, res) => {
  try {
    const journals = await PaymentJournal.findAll({
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

    const payWhere = {};
    if (date_from || date_to) {
      payWhere.created_at = {};
      if (date_from) payWhere.created_at[Op.gte] = date_from;
      if (date_to)   payWhere.created_at[Op.lt]  = Sequelize.literal(`('${date_to}'::date + INTERVAL '1 day')`);
    }

    const journals = await PaymentJournal.findAll({
      attributes: [
        'id', 'name', 'type', 'bank_id', 'color', 'currency_id',
        // Cantidad de pagos
        [Sequelize.fn('COUNT', Sequelize.col('Payments.id')), 'tx_count'],
        // Total: payment.amount en USD × exchange_rate del cobro = monto original en la moneda cobrada
        [Sequelize.literal(`
          COALESCE(SUM(
            "Payments"."amount" * COALESCE("Payments"."exchange_rate", 1)
          ), 0)
        `), 'total_ingresos'],
        // Hoy
        [Sequelize.literal(`
          COALESCE(SUM(CASE WHEN "Payments"."created_at" >= CURRENT_DATE
            THEN "Payments"."amount" * COALESCE("Payments"."exchange_rate", 1)
          END), 0)
        `), 'ingresos_hoy'],
      ],
      include: [
        { model: Currency, attributes: ['code', 'symbol', 'is_base', 'exchange_rate'], required: false },
        { model: Bank,     attributes: ['name'],                                        required: false },
        { model: Payment,  attributes: [], required: false, where: payWhere },
      ],
      where: { active: true },
      group: [
        'PaymentJournal.id',
        'Currency.id', 'Currency.code', 'Currency.symbol', 'Currency.is_base', 'Currency.exchange_rate',
        'Bank.id', 'Bank.name',
      ],
      order: [['sort_order', 'ASC'], ['id', 'ASC']],
      subQuery: false,
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

module.exports = { getAll, create, update, remove, summary };
