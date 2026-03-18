const { PaymentJournal, Currency, Bank, Sale, Sequelize } = require("../models");
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
// This query uses complex CASE/SUM logic — kept as a Raw Query for performance
const rawPool = require("../db/pool");

const summary = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let dateFilter = "";
    const params = [];
    if (date_from) { params.push(date_from); dateFilter += ` AND s.created_at >= $${params.length}::date`; }
    if (date_to)   { params.push(date_to);   dateFilter += ` AND s.created_at <  ($${params.length}::date + INTERVAL '1 day')`; }

    const { rows } = await rawPool.query(`
      SELECT
        pj.id, pj.name, pj.type, pj.bank_id, b.name AS bank_name, pj.color,
        pj.currency_id, cur.code AS currency_code, cur.symbol AS currency_symbol, cur.is_base AS currency_is_base,
        COUNT(s.id) AS tx_count,
        COALESCE(SUM(CASE WHEN cur.id IS NULL OR cur.is_base = TRUE THEN s.total ELSE s.total * s.exchange_rate END), 0) AS total_ingresos,
        COALESCE(SUM(CASE WHEN s.created_at >= CURRENT_DATE THEN CASE WHEN cur.id IS NULL OR cur.is_base = TRUE THEN s.total ELSE s.total * s.exchange_rate END END), 0) AS ingresos_hoy
      FROM payment_journals pj
      LEFT JOIN currencies cur ON cur.id = pj.currency_id
      LEFT JOIN banks b ON b.id = pj.bank_id
      LEFT JOIN sales s ON s.payment_journal_id = pj.id ${dateFilter}
      WHERE pj.active = TRUE
      GROUP BY pj.id, cur.id, cur.code, cur.symbol, cur.is_base, b.name
      ORDER BY pj.sort_order, pj.id
    `, params);

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener resumen" });
  }
};

module.exports = { getAll, create, update, remove, summary };
