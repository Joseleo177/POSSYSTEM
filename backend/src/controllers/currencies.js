const https = require("https");
const tls   = require("tls");
const fs    = require("fs");
const path  = require("path");
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

    // updated_at a mano (el modelo no lleva timestamps): sin esto, poner la tasa a mano o
    // aplicarla desde el aviso del BCV dejaba la tarjeta de Monedas diciendo "no se ha
    // actualizado hoy".
    await currency.update({ exchange_rate, updated_at: new Date() });
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

    const currencies = await Currency.findAll({ where: { is_base: false } });
    log("currencies:", currencies.map(c => c.code));
    const updated = [];
    const errors = [];

    const vesCur = currencies.find(c => c.code === "VES");
    if (vesCur && baseCur.code === "USD") {
      try {
        log("fetching BCV...");
        const bcv = await getBcvRateCached(true);
        log("BCV =", bcv.rate, "fecha valor", bcv.value_date);
        await vesCur.update({ exchange_rate: bcv.rate, updated_at: new Date() });
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

    await currency.destroy();
    res.json({ ok: true, message: "Moneda eliminada" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar moneda" });
  }
};

module.exports = { getAll, updateRate, toggle, create, refreshRates, getBcvPreview, remove };
