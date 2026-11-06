const https = require("https");
const tls   = require("tls");
const fs    = require("fs");
const path  = require("path");
const { Currency, Sequelize } = require("../models");
const { broadcast } = require("../services/sseService");
const rates = require("../services/currencyRates");

const companyOf = (req) => req.company_id ?? req.employee?.company_id ?? null;
const RATE_SOURCES = new Set(["manual", "bcv"]);

// Base, luego la local (los Bs) y cada tasa alterna justo debajo de su moneda (mismo código).
const ORDEN = [['is_base', 'DESC'], ['is_local', 'DESC'], ['code', 'ASC'], ['rate_of_id', 'ASC NULLS FIRST'], ['name', 'ASC']];

const avisarCambio = async (req) => {
  const all = await Currency.findAll({ order: ORDEN });
  broadcast(req.company_id ?? 0, 'currencies:updated', { currencies: all.map(c => c.toJSON()) });
  return all;
};

// Si la empresa se queda sin moneda local (se borró), la toma la divisa más vieja que quede.
const asegurarLocal = async (transaction) => {
  const hay = await Currency.count({ where: { is_local: true }, transaction });
  if (hay) return;
  const siguiente = await Currency.findOne({ where: { is_base: false, rate_of_id: null }, order: [['id', 'ASC']], transaction });
  if (siguiente) await siguiente.update({ is_local: true }, { transaction });
};

// GET /api/currencies
const getAll = async (req, res) => {
  try {
    const currencies = await Currency.findAll({
      order: ORDEN
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

    // updated_at a mano (el modelo no lleva timestamps): sin esto, poner la tasa a mano o
    // aplicarla desde el aviso del BCV dejaba la tarjeta de Monedas diciendo "no se ha
    // actualizado hoy".
    await currency.update({ exchange_rate, updated_at: new Date() });
    // El aviso del BCV manda source "bcv"; Monedas, nada (a mano).
    await rates.recordRate(currency, {
      source: RATE_SOURCES.has(req.body.source) ? req.body.source : "manual",
      employee_id: req.employee?.id ?? null,
    });
    await avisarCambio(req);
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
// { code, name, symbol, exchange_rate, auto_sync? } — una divisa nueva.
// { rate_of_id, name, exchange_rate }               — una tasa alterna de una divisa (Bs a la
//   tasa USDT): mismo código y símbolo que su moneda, la tasa la pone la tienda.
const create = async (req, res) => {
  try {
    const rate = parseFloat(req.body.exchange_rate);
    const name = String(req.body.name || "").trim();
    if (!(rate > 0)) return res.status(400).json({ ok: false, message: "La tasa debe ser mayor que cero" });

    let datos;
    if (req.body.rate_of_id) {
      const madre = await Currency.findOne({ where: { id: req.body.rate_of_id, is_base: false, rate_of_id: null } });
      if (!madre) return res.status(404).json({ ok: false, message: "La moneda de esa tasa no existe" });
      if (!name) return res.status(400).json({ ok: false, message: "Ponle nombre a la tasa (por ejemplo, USDT)" });
      datos = { code: madre.code, symbol: madre.symbol, name, rate_of_id: madre.id, auto_sync: false, is_local: false };
    } else {
      const { code, symbol } = req.body;
      if (!code || !name || !symbol) return res.status(400).json({ ok: false, message: "Todos los campos son requeridos" });
      // La primera divisa de una empresa que solo tenía la base pasa a ser la local.
      const hayLocal = await Currency.count({ where: { is_local: true } });
      datos = { code: String(code).toUpperCase(), name, symbol, auto_sync: req.body.auto_sync !== false, is_local: !hayLocal };
    }

    const currency = await Currency.create({ ...datos, exchange_rate: rate });
    await rates.recordRate(currency, { employee_id: req.employee?.id ?? null });
    await avisarCambio(req);
    res.status(201).json({ ok: true, data: currency });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ ok: false, message: req.body.rate_of_id ? "Ya hay una tasa con ese nombre" : "Esa moneda ya existe" });
    }
    console.error("[currencies] create:", err);
    res.status(500).json({ ok: false, message: "Error al crear moneda" });
  }
};

// PUT /api/currencies/:id/local — la moneda que la pantalla muestra junto a la base.
const setLocal = async (req, res) => {
  try {
    const currency = await Currency.findOne({ where: { id: req.params.id, is_base: false, rate_of_id: null } });
    if (!currency) return res.status(404).json({ ok: false, message: "Moneda no encontrada" });
    await Currency.sequelize.transaction(async (transaction) => {
      // Primero se apaga la anterior: el índice único no admite dos locales ni un instante.
      await Currency.update({ is_local: false }, { where: { is_local: true, company_id: currency.company_id }, transaction });
      await currency.update({ is_local: true }, { transaction });
    });
    res.json({ ok: true, data: await avisarCambio(req) });
  } catch (err) {
    console.error("[currencies] local:", err);
    res.status(500).json({ ok: false, message: "Error al cambiar la moneda local" });
  }
};

// PUT /api/currencies/:id/auto-sync — si "Sincronizar tasas" la actualiza o la pone la tienda.
const toggleAutoSync = async (req, res) => {
  try {
    const currency = await Currency.findOne({ where: { id: req.params.id, is_base: false } });
    if (!currency) return res.status(404).json({ ok: false, message: "Moneda no encontrada" });
    await currency.update({ auto_sync: !currency.auto_sync });
    await avisarCambio(req);
    res.json({ ok: true, data: currency });
  } catch (err) {
    console.error("[currencies] auto-sync:", err);
    res.status(500).json({ ok: false, message: "Error al actualizar la moneda" });
  }
};

// Página del BCV. Su servidor envía un intermedio equivocado en vez del que firmó su
// certificado, así que Node la rechazaba (UNABLE_TO_VERIFY_LEAF_SIGNATURE) aunque un navegador
// —que completa la cadena solo— la abre sin problema. Se le da a Node ese intermedio
// (Sectigo Public Server Authentication CA DV R36, bajado de crt.sectigo.com, vence en 2036)
// junto a sus raíces de siempre: la verificación sigue encendida, solo se completa la cadena.
// Si el BCV cambia de certificadora esto falla y se cae a dolarapi, que es el respaldo.
const BCV_CA = [...tls.rootCertificates, fs.readFileSync(path.join(__dirname, "../certs/sectigo-dv-r36.pem"), "utf8")];
const fetchBcvPage = () => new Promise((resolve, reject) => {
  const req = https.get("https://www.bcv.org.ve/", {
    ca: BCV_CA,
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
    timeout: 8000,
  }, (res) => {
    if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
    let body = "";
    res.setEncoding("utf8");
    res.on("data", (c) => { body += c; if (body.length > 3e6) req.destroy(new Error("respuesta demasiado grande")); });
    res.on("end", () => resolve(body));
  });
  req.on("timeout", () => req.destroy(new Error("tiempo de espera agotado")));
  req.on("error", reject);
});

// "876,79760000" dentro del bloque id="dolar" y la fecha valor en el atributo content del
// span que la acompaña ("2026-10-13T00:00:00-04:00").
const parseBcvPage = (html) => {
  const block = html.split('id="dolar"')[1] || "";
  const m = block.match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/);
  const d = html.match(/Fecha Valor:[\s\S]{0,300}?content="(\d{4}-\d{2}-\d{2})/);
  const rate = m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : 0;
  return { rate, value_date: d ? d[1] : null };
};

// Obtiene la tasa BCV oficial (USD -> VES) y su FECHA VALOR: el día desde el que rige.
//
// El BCV publica en la tarde la tasa del próximo día hábil (el viernes, la del lunes; antes
// de un feriado, la del día siguiente a él). Muchos comercios cobran con ella desde que sale,
// sobre todo el fin de semana, así que el sistema no la aplica solo: la ofrece con su fecha
// y el usuario decide (ver GET /currencies/bcv).
//
// Primero la página del BCV, que es la fuente y trae la fecha valor exacta. dolarapi queda de
// respaldo: el 11-10-2026 seguía en 875,65 "del 09/10" cuando el BCV ya publicaba 876,80 con
// fecha valor 13/10.
const getBcvRate = async () => {
  const errors = [];
  try {
    const { rate, value_date } = parseBcvPage(await fetchBcvPage());
    if (rate > 0) return { rate, value_date, source: "bcv.org.ve" };
    errors.push("bcv.org.ve → no se encontró la tasa en la página");
  } catch (e) {
    errors.push(`bcv.org.ve → ${e.message}`);
  }

  const sources = [
    { url: "https://ve.dolarapi.com/v1/dolares/oficial",   pick: (d) => d?.promedio, date: (d) => d?.fechaActualizacion },
    { url: "https://pydolarve.org/api/v1/dollar?page=bcv", pick: (d) => d?.monitors?.bcv?.price, date: () => null },
  ];
  for (const src of sources) {
    try {
      const r = await fetch(src.url, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) { errors.push(`${src.url} → HTTP ${r.status}`); continue; }
      const d = await r.json();
      const price = Number(src.pick(d));
      const date = String(src.date(d) || "").slice(0, 10);
      if (price > 0) return { rate: price, value_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, source: new URL(src.url).hostname };
      errors.push(`${src.url} → respuesta sin precio válido`);
    } catch (e) {
      errors.push(`${src.url} → ${e.message}`);
    }
  }
  throw new Error("No se pudo obtener la tasa BCV: " + errors.join(" | "));
};

// La misma tasa vale para todas las empresas: se guarda unos minutos para que cada pestaña
// abierta no salga a consultar al BCV por su cuenta (en Vercel se paga el tiempo esperando).
const BCV_CACHE_MS = 10 * 60 * 1000;
let bcvCache = null;
const getBcvRateCached = async (fresh = false) => {
  if (!fresh && bcvCache && Date.now() - bcvCache.at < BCV_CACHE_MS) return bcvCache.data;
  const data = await getBcvRate();
  bcvCache = { at: Date.now(), data };
  return data;
};

// GET /api/currencies/bcv — tasa disponible en el BCV, SIN aplicarla. ?fresh=1 salta la caché
// (el botón de la barra: quien lo pulsa quiere lo último, no lo de hace diez minutos).
const getBcvPreview = async (req, res) => {
  try {
    const data = await getBcvRateCached(req.query.fresh === "1");
    res.json({ ok: true, data });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
};

// POST /api/currencies/refresh
const refreshRates = async (req, res) => {
  const log = (...a) => console.log("[refreshRates]", ...a);
  try {
    log("start");
    const baseCur = await Currency.findOne({ where: { is_base: true } });
    log("baseCur:", baseCur?.code);
    if (!baseCur) return res.status(400).json({ ok: false, message: "No hay moneda base definida" });

    // Solo las que se actualizan solas: la tasa USDT y los pesos de frontera los pone la tienda,
    // y la internacional del peso pisaría la de Cúcuta.
    const currencies = await Currency.findAll({ where: { is_base: false, rate_of_id: null, auto_sync: true } });
    log("currencies:", currencies.map(c => c.code));
    if (!currencies.length) {
      return res.json({ ok: true, updated: [], errors: [], data: await Currency.findAll({ order: ORDEN }) });
    }
    const updated = [];
    const errors = [];

    const vesCur = currencies.find(c => c.code === "VES");
    if (vesCur && baseCur.code === "USD") {
      try {
        log("fetching BCV...");
        const bcv = await getBcvRateCached(true);
        log("BCV =", bcv.rate, "fecha valor", bcv.value_date);
        await vesCur.update({ exchange_rate: bcv.rate, updated_at: new Date() });
        await rates.recordRate(vesCur, { source: "bcv", employee_id: req.employee?.id ?? null });
        log("VES updated in DB");
        updated.push({ code: "VES", rate: bcv.rate, value_date: bcv.value_date, source: "BCV" });
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

        // No llamarla "rates": tapaba el servicio de historial y rates.recordRate reventaba con
        // la primera divisa que no fuera el bolívar.
        const apiRates = apiData.rates || {};
        for (const cur of others) {
          const rate = apiRates[cur.code];
          if (rate && rate > 0) {
            await cur.update({ exchange_rate: rate, updated_at: new Date() });
            await rates.recordRate(cur, { source: "er-api", employee_id: req.employee?.id ?? null });
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

    res.json({ ok: true, updated, errors, data: await avisarCambio(req) });
  } catch (err) {
    console.error("[refreshRates] FATAL:", err);
    res.status(500).json({ ok: false, message: err.message || "Error al actualizar tasas" });
  }
};

// DELETE /api/currencies/:id
const remove = async (req, res) => {
  try {
    const currency = await Currency.findOne({ where: { id: req.params.id, is_base: false } });
    if (!currency) return res.status(404).json({ ok: false, message: "Moneda no encontrada o es moneda base" });

    const { Payment, Sale } = require("../models");
    const [paymentCount, saleCount] = await Promise.all([
      Payment.count({ where: { currency_id: currency.id } }),
      Sale.count({ where: { currency_id: currency.id } }),
    ]);
    if (paymentCount > 0 || saleCount > 0) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar: tiene movimientos asociados. Puedes suspenderla en su lugar." });
    }
    // Sus tasas alternas se irían con ella (ON DELETE CASCADE) junto con la referencia de sus
    // cobros: que se borren antes, a mano, y ahí se ve si tienen movimientos.
    if (await Currency.count({ where: { rate_of_id: currency.id } })) {
      return res.status(400).json({ ok: false, message: "Tiene tasas alternas (como USDT): elimínalas o suspéndelas primero." });
    }

    await Currency.sequelize.transaction(async (transaction) => {
      await currency.destroy({ transaction });
      if (currency.is_local) await asegurarLocal(transaction);
    });
    await avisarCambio(req);
    res.json({ ok: true, message: "Moneda eliminada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar moneda" });
  }
};

// ── Historial de tasas (services/currencyRates) ──────────────────────────────
const sendError = (res, err, fallback) => res.status(err.status || 500)
  .json({ ok: false, message: err.isOperational ? err.message : fallback });

// GET /api/currencies/rates/on?date=YYYY-MM-DD — tasa de cada moneda ese día. La pide la
// pantalla de cobro cuando el pago es de una fecha anterior: cualquiera que cobre la necesita.
const getRatesOn = async (req, res) => {
  try {
    res.json({ ok: true, data: await rates.ratesOn(companyOf(req), req.query.date) });
  } catch (err) {
    if (!err.isOperational) console.error("[currencies] rates/on:", err);
    sendError(res, err, "Error al consultar la tasa de esa fecha");
  }
};

// GET /api/currencies/:id/rates?from&to&limit
const getHistory = async (req, res) => {
  try {
    res.json({ ok: true, data: await rates.history(companyOf(req), { ...req.query, currency_id: req.params.id }) });
  } catch (err) {
    if (!err.isOperational) console.error("[currencies] history:", err);
    sendError(res, err, "Error al obtener el historial de tasas");
  }
};

// PUT /api/currencies/:id/rates/:date { rate } — corrige o completa un día pasado.
const putDayRate = async (req, res) => {
  try {
    const data = await rates.setDayRate(companyOf(req), {
      currency_id: req.params.id, date: req.params.date, rate: req.body?.rate, employee_id: req.employee?.id,
    });
    res.json({ ok: true, data });
  } catch (err) {
    if (!err.isOperational) console.error("[currencies] day rate:", err);
    sendError(res, err, "Error al guardar la tasa de ese día");
  }
};

module.exports = { getAll, updateRate, toggle, create, setLocal, toggleAutoSync, refreshRates, getBcvPreview, remove, getRatesOn, getHistory, putDayRate };
