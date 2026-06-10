const { Currency, Sequelize } = require("../models");
const { broadcast } = require("../services/sseService");

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
    const all = await Currency.findAll({ order: [['is_base', 'DESC'], ['code', 'ASC']] });
    broadcast(req.company_id ?? 0, 'currencies:updated', { currencies: all.map(c => c.toJSON()) });
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

// Obtiene tasa BCV oficial (USD -> VES)
const getBcvRate = async () => {
  const sources = [
    { url: "https://ve.dolarapi.com/v1/dolares/oficial",   pick: (d) => d?.promedio },
    { url: "https://pydolarve.org/api/v1/dollar?page=bcv", pick: (d) => d?.monitors?.bcv?.price },
  ];
  const errors = [];
  for (const src of sources) {
    try {
      const r = await fetch(src.url, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) { errors.push(`${src.url} → HTTP ${r.status}`); continue; }
      const d = await r.json();
      const price = Number(src.pick(d));
      if (price > 0) return price;
      errors.push(`${src.url} → respuesta sin precio válido`);
    } catch (e) {
      errors.push(`${src.url} → ${e.message}`);
    }
  }
  throw new Error("No se pudo obtener la tasa BCV: " + errors.join(" | "));
};

// POST /api/currencies/refresh
const refreshRates = async (req, res) => {
  const log = (...a) => console.log("[refreshRates]", ...a);
  try {
    log("start");
    const baseCur = await Currency.findOne({ where: { is_base: true } });
    log("baseCur:", baseCur?.code);
    if (!baseCur) return res.status(400).json({ ok: false, message: "No hay moneda base definida" });

    const currencies = await Currency.findAll({ where: { is_base: false } });
    log("currencies:", currencies.map(c => c.code));
    const updated = [];
    const errors = [];

    const vesCur = currencies.find(c => c.code === "VES");
    if (vesCur && baseCur.code === "USD") {
      try {
        log("fetching BCV...");
        const bcvRate = await getBcvRate();
        log("BCV =", bcvRate);
        await vesCur.update({ exchange_rate: bcvRate, updated_at: new Date() });
        log("VES updated in DB");
        updated.push({ code: "VES", rate: bcvRate, source: "BCV" });
      } catch (e) {
        log("VES error:", e.message);
        errors.push({ code: "VES", error: e.message });
      }
    }

    const others = currencies.filter(c => !(c.code === "VES" && baseCur.code === "USD"));
    log("others:", others.map(c => c.code));
    if (others.length) {
      try {
        log("fetching er-api...");
        const apiRes = await fetch(`https://open.er-api.com/v6/latest/${baseCur.code}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!apiRes.ok) throw new Error("No se pudo conectar con open.er-api.com");
        const apiData = await apiRes.json();
        if (apiData.result !== "success") throw new Error("La API de tasas devolvió un error");

        const rates = apiData.rates || {};
        for (const cur of others) {
          const rate = rates[cur.code];
          if (rate && rate > 0) {
            await cur.update({ exchange_rate: rate, updated_at: new Date() });
            updated.push({ code: cur.code, rate, source: "er-api" });
          }
        }
      } catch (e) {
        log("others error:", e.message);
        errors.push({ scope: "others", error: e.message });
      }
    }

    log("done. updated:", updated.length, "errors:", errors.length);
    if (!updated.length) throw new Error(errors.map(e => e.error).join(" | ") || "No se actualizó ninguna tasa");

    const result = await Currency.findAll({ order: [['is_base', 'DESC'], ['code', 'ASC']] });
    broadcast(req.company_id ?? 0, 'currencies:updated', { currencies: result.map(c => c.toJSON()) });
    res.json({ ok: true, updated, errors, data: result });
  } catch (err) {
    console.error("[refreshRates] FATAL:", err);
    res.status(500).json({ ok: false, message: err.message || "Error al actualizar tasas" });
  }
};

module.exports = { getAll, updateRate, toggle, create, refreshRates };
