const { Currency, Sequelize } = require("../models");

// GET /api/currencies
const getAll = async (req, res) => {
  try {
    const currencies = await Currency.findAll({
      order: [['is_base', 'DESC'], ['code', 'ASC']]
    });
    res.json({ ok: true, data: currencies });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al obtener monedas" });
  }
};

// PUT /api/currencies/:id/rate
const updateRate = async (req, res) => {
  try {
    const { exchange_rate } = req.body;
    if (!exchange_rate || exchange_rate <= 0) return res.status(400).json({ ok: false, message: "Tipo de cambio inválido" });

    const currency = await Currency.findOne({ where: { id: req.params.id, is_base: false } });
    if (!currency) return res.status(404).json({ ok: false, message: "Moneda no encontrada o es moneda base" });

    await currency.update({ exchange_rate });
    res.json({ ok: true, data: currency });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al actualizar tipo de cambio" });
  }
};

// PUT /api/currencies/:id/toggle
const toggle = async (req, res) => {
  try {
    const currency = await Currency.findOne({ where: { id: req.params.id, is_base: false } });
    if (!currency) return res.status(404).json({ ok: false, message: "Moneda no encontrada o es moneda base" });

    await currency.update({ active: !currency.active });
    res.json({ ok: true, data: currency });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Error al actualizar moneda" });
  }
};

// POST /api/currencies
const create = async (req, res) => {
  try {
    const { code, name, symbol, exchange_rate } = req.body;
    if (!code || !name || !symbol || !exchange_rate) return res.status(400).json({ ok: false, message: "Todos los campos son requeridos" });

    const currency = await Currency.create({ code: code.toUpperCase(), name, symbol, exchange_rate });
    res.status(201).json({ ok: true, data: currency });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ ok: false, message: "Esa moneda ya existe" });
    res.status(500).json({ ok: false, message: "Error al crear moneda" });
  }
};

// POST /api/currencies/refresh
const refreshRates = async (req, res) => {
  try {
    const baseCur = await Currency.findOne({ where: { is_base: true } });
    if (!baseCur) return res.status(400).json({ ok: false, message: "No hay moneda base definida" });

    const apiRes = await fetch(`https://open.er-api.com/v6/latest/${baseCur.code}`);
    if (!apiRes.ok) throw new Error("No se pudo conectar con la API de tasas de cambio");
    const apiData = await apiRes.json();
    if (apiData.result !== "success") throw new Error("La API de tasas devolvió un error");

    const rates = apiData.rates;
    const currencies = await Currency.findAll({ where: { is_base: false } });

    const updated = [];
    for (const cur of currencies) {
      const rate = rates[cur.code];
      if (rate && rate > 0) {
        await cur.update({ exchange_rate: rate, updated_at: Sequelize.fn('NOW') });
        updated.push({ code: cur.code, rate });
      }
    }

    const result = await Currency.findAll({ order: [['is_base', 'DESC'], ['code', 'ASC']] });
    res.json({ ok: true, updated, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message || "Error al actualizar tasas" });
  }
};

module.exports = { getAll, updateRate, toggle, create, refreshRates };
