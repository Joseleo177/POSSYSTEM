const https = require("https");
const tls   = require("tls");
const fs    = require("fs");
const path  = require("path");
const { Currency, Setting, Sequelize } = require("../models");
const { broadcast } = require("../services/sseService");
const rates = require("../services/currencyRates");

const companyOf = (req) => req.company_id ?? req.employee?.company_id ?? null;
// Lo que el aviso de la tasa puede mandar al aplicarla (ver ORIGEN_FUENTE).
const RATE_SOURCES = new Set(["manual", "bcv", "bcv-euro", "paralelo"]);

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
//
// 23-11-2026: el BCV pasó a un certificado OV (Sectigo Public Server Authentication CA OV R36,
// de crt.sectigo.com, vence en 2036) y desde entonces todo salía de dolarapi, que iba un día
// atrasado. Se cargan TODOS los .pem de certs/: si vuelve a cambiar, basta con agregar el
// intermedio nuevo ahí (el emisor sale en el certificado del BCV, campo "CA Issuers").
const CERTS_DIR = path.join(__dirname, "../certs");
const BCV_CA = [
  ...tls.rootCertificates,
  ...fs.readdirSync(CERTS_DIR).filter(f => f.endsWith(".pem")).map(f => fs.readFileSync(path.join(CERTS_DIR, f), "utf8")),
];
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

// "876,79760000" dentro de cada bloque (id="dolar", id="euro") y la fecha valor en el atributo
// content del span que los acompaña ("2026-10-13T00:00:00-04:00"). Es una sola fecha valor
// para todas las divisas que publica el BCV.
const tasaDelBloque = (html, id) => {
  const block = html.split(`id="${id}"`)[1] || "";
  const m = block.match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/);
  return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : 0;
};
const parseBcvPage = (html) => {
  const d = html.match(/Fecha Valor:[\s\S]{0,300}?content="(\d{4}-\d{2}-\d{2})/);
  return { usd: tasaDelBloque(html, "dolar"), eur: tasaDelBloque(html, "euro"), value_date: d ? d[1] : null };
};

const getJson = async (url) => {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};
const fechaIso = (v) => {
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

// Tasas oficiales del BCV (bolívares por dólar y por euro) con su FECHA VALOR: el día desde
// el que rigen.
//
// El BCV publica en la tarde la tasa del próximo día hábil (el viernes, la del lunes; antes
// de un feriado, la del día siguiente a él). Muchos comercios cobran con ella desde que sale,
// sobre todo el fin de semana, así que el sistema no la aplica solo: la ofrece con su fecha
// y el usuario decide (ver GET /currencies/bcv).
//
// Primero la página del BCV, que es la fuente y trae la fecha valor exacta. Dólar y euro
// salen de la MISMA descarga: la tienda que trabaja con el euro no suma consultas. dolarapi
// queda de respaldo: el 11-10-2026 seguía en 875,65 "del 09/10" cuando el BCV ya publicaba
// 876,80 con fecha valor 13/10 (y el 23-11 seguía con la del viernes 20).
const getBcvRates = async () => {
  const errors = [];
  try {
    const { usd, eur, value_date } = parseBcvPage(await fetchBcvPage());
    if (usd > 0) return { usd, eur: eur > 0 ? eur : null, value_date, source: "bcv.org.ve" };
    errors.push("bcv.org.ve → no se encontró la tasa en la página");
  } catch (e) {
    errors.push(`bcv.org.ve → ${e.message}`);
  }

  // /v1/cotizaciones trae el dólar y el euro oficiales en una sola respuesta.
  try {
    const lista = await getJson("https://ve.dolarapi.com/v1/cotizaciones");
    const de = (moneda) => (Array.isArray(lista) ? lista : []).find(x => x?.moneda === moneda && x?.fuente === "oficial");
    const usd = Number(de("USD")?.promedio), eur = Number(de("EUR")?.promedio);
    if (usd > 0) {
      return { usd, eur: eur > 0 ? eur : null, value_date: fechaIso(de("USD")?.fechaActualizacion), source: "ve.dolarapi.com" };
    }
    errors.push("ve.dolarapi.com → respuesta sin precio válido");
  } catch (e) {
    errors.push(`ve.dolarapi.com → ${e.message}`);
  }

  try {
    const d = await getJson("https://pydolarve.org/api/v1/dollar?page=bcv");
    const usd = Number(d?.monitors?.bcv?.price);
    if (usd > 0) return { usd, eur: null, value_date: null, source: "pydolarve.org" };
    errors.push("pydolarve.org → respuesta sin precio válido");
  } catch (e) {
    errors.push(`pydolarve.org → ${e.message}`);
  }
  throw new Error("No se pudo obtener la tasa BCV: " + errors.join(" | "));
};

// Dólar paralelo de dolarapi: un promedio del mercado que en Venezuela anda pegado a la USDT de
// Binance (23-11-2026: 1.107 contra una USDT de ~1.100). No es el anuncio exacto de nadie, por
// eso solo se OFRECE: si la tienda mira otro número, lo pone a mano y el aviso no se lo pisa.
// No trae fecha valor: rige desde que sale y se mueve durante el día.
const getParalelo = async () => {
  try {
    const d = await getJson("https://ve.dolarapi.com/v1/dolares/paralelo");
    const rate = Number(d?.promedio);
    if (rate > 0) return { rate, value_date: null, updated_at: d?.fechaActualizacion || null, source: "ve.dolarapi.com" };
    throw new Error("respuesta sin precio válido");
  } catch (e) {
    throw new Error(`No se pudo obtener el dólar paralelo: ve.dolarapi.com → ${e.message}`);
  }
};

// Las mismas tasas valen para todas las empresas: se guardan unos minutos para que cada
// pestaña abierta no salga a consultar por su cuenta (en Vercel se paga el tiempo esperando).
const RATE_CACHE_MS = 10 * 60 * 1000;
const cacheado = (fn) => {
  let memo = null;
  return async (fresh = false) => {
    if (!fresh && memo && Date.now() - memo.at < RATE_CACHE_MS) return memo.data;
    const data = await fn();
    memo = { at: Date.now(), data };
    return data;
  };
};
const getBcvRatesCached = cacheado(getBcvRates);
const getParaleloCached = cacheado(getParalelo);

// ── Tasa del bolívar de cada empresa ─────────────────────────────────────────
// La base es el dólar (así se trabaja en Venezuela) y lo que cambia de una tienda a otra es a
// qué tasa pasa ese dólar a bolívares: el dólar BCV (lo de siempre), el euro BCV ($10 × euro)
// o la USDT. Es un ajuste de la empresa: sin la clave, dólar BCV, como todas hasta hoy.
//   bcv_usd  → bcv.org.ve, dólar (aviso con fecha valor)
//   bcv_eur  → bcv.org.ve, euro (aviso con fecha valor)
//   paralelo → dolarapi paralelo (aviso sin fecha valor; referencia de la USDT)
//   manual   → la pone la tienda; ni el aviso ni "Sincronizar" la tocan
const RATE_SOURCE_KEY = "bolivar_rate_source";
const FUENTES_BOLIVAR = new Set(["bcv_usd", "bcv_eur", "paralelo", "manual"]);
// Lo que queda en el historial de tasas (currency_rates.source) al aplicarla.
const ORIGEN_FUENTE = { bcv_usd: "bcv", bcv_eur: "bcv-euro", paralelo: "paralelo" };

// Sin la clave (empresas de antes): dólar BCV, salvo que ya hubieran apagado el "Sincronizar"
// del bolívar, que era la forma de decir "la tasa la pongo yo". Espejo de fuenteBolivar
// (frontend/src/helpers/tasaBolivar.js).
const fuenteDelBolivar = async (companyId) => {
  if (!companyId) return "bcv_usd";
  const row = await Setting.findOne({ where: { key: RATE_SOURCE_KEY, company_id: companyId } });
  if (FUENTES_BOLIVAR.has(row?.value)) return row.value;
  const ves = await Currency.findOne({ where: { company_id: companyId, code: "VES", is_base: false, rate_of_id: null }, attributes: ["auto_sync"] });
  return ves && ves.auto_sync === false ? "manual" : "bcv_usd";
};

// La tasa que la fuente de la empresa ofrece hoy: { rate, value_date, source, kind }.
const tasaDeFuente = async (kind, fresh = false) => {
  if (kind === "paralelo") return { ...(await getParaleloCached(fresh)), kind };
  const bcv = await getBcvRatesCached(fresh);
  if (kind === "bcv_eur") {
    if (!(bcv.eur > 0)) throw new Error(`No se pudo obtener la tasa BCV del euro (${bcv.source} no la trajo)`);
    return { rate: bcv.eur, value_date: bcv.value_date, source: bcv.source, kind };
  }
  return { rate: bcv.usd, value_date: bcv.value_date, source: bcv.source, kind: "bcv_usd" };
};

// GET /api/currencies/bcv — la tasa que la fuente de la empresa ofrece, SIN aplicarla. ?fresh=1
// salta la caché (el botón de la barra: quien lo pulsa quiere lo último, no lo de hace diez
// minutos). Con la tasa a mano no hay nada que ofrecer: data null.
const getBcvPreview = async (req, res) => {
  try {
    const kind = await fuenteDelBolivar(companyOf(req));
    if (kind === "manual") return res.json({ ok: true, data: null, kind });
    const data = await tasaDeFuente(kind, req.query.fresh === "1");
    res.json({ ok: true, data, kind });
  } catch (err) {
    res.status(502).json({ ok: false, message: err.message });
  }
};

// PUT /api/currencies/source { source } — de dónde sale la tasa del bolívar. Vive en Monedas
// (permiso currencies.manage), no en Configuración: es parte de manejar la tasa del día.
// "Manual" apaga además el "Sincronizar" del bolívar, para que las dos cosas digan lo mismo.
const setRateSource = async (req, res) => {
  try {
    const source = String(req.body?.source || "");
    if (!FUENTES_BOLIVAR.has(source)) return res.status(400).json({ ok: false, message: "Fuente de tasa no válida" });
    const company_id = companyOf(req);
    if (!company_id) return res.status(400).json({ ok: false, message: "Elige una empresa primero" });
    await Setting.upsert({ key: RATE_SOURCE_KEY, value: source, company_id });
    await Currency.update({ auto_sync: source !== "manual" }, { where: { company_id, code: "VES", is_base: false, rate_of_id: null } });
    await avisarCambio(req);
    res.json({ ok: true, data: { source } });
  } catch (err) {
    console.error("[currencies] source:", err);
    res.status(500).json({ ok: false, message: "Error al guardar la fuente de la tasa" });
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

    // El bolívar sale de la fuente de la empresa (dólar BCV, euro BCV o paralelo). A mano, no se
    // toca; y nunca va a er-api, que da una tasa internacional que no es la de ninguna tienda.
    const vesCur = currencies.find(c => c.code === "VES");
    if (vesCur && baseCur.code === "USD") {
      const kind = await fuenteDelBolivar(companyOf(req));
      if (kind !== "manual") {
        try {
          log("fetching", kind, "...");
          const t = await tasaDeFuente(kind, true);
          log(kind, "=", t.rate, "fecha valor", t.value_date);
          await vesCur.update({ exchange_rate: t.rate, updated_at: new Date() });
          await rates.recordRate(vesCur, { source: ORIGEN_FUENTE[kind], employee_id: req.employee?.id ?? null });
          log("VES updated in DB");
          updated.push({ code: "VES", rate: t.rate, value_date: t.value_date, source: ORIGEN_FUENTE[kind] });
        } catch (e) {
          log("VES error:", e.message);
          errors.push({ code: "VES", error: e.message });
        }
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
    // Sin errores y sin nada que actualizar (bolívar a mano y ninguna otra divisa): está al día.
    if (!updated.length && errors.length) throw new Error(errors.map(e => e.error).join(" | "));

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

module.exports = { getAll, updateRate, toggle, create, setLocal, toggleAutoSync, refreshRates, getBcvPreview, setRateSource, remove, getRatesOn, getHistory, putDayRate };
