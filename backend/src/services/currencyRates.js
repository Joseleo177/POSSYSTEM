/**
 * Historial de tasas: la tasa con la que el negocio cobró cada día (tabla currency_rates).
 *
 * Existe para los cobros que se registran tarde: el cobrador de calle cobra el 20/10 y pasa el
 * abono el 04/11. Ese abono va a la tasa del 20/10, la del DÍA DEL PAGO (decisión del usuario,
 * 04-11-2026), y la pantalla de cobro la pide acá según la fecha que se elija.
 *
 * Un día sin fila hereda la del último día anterior que tenga: fines de semana y días en que
 * nadie tocó la tasa siguen con la que había.
 */
const { sequelize, Sequelize } = require("../models");
const { TIMEZONE } = require("../utils/localDate");

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

/**
 * Deja la tasa de hoy en el historial. La llaman todos los caminos que cambian
 * currencies.exchange_rate (a mano, aviso del BCV, sincronizar): la última del día manda.
 * Nunca rompe la operación que la llama: sin historial la tasa igual queda cambiada.
 */
async function recordRate(currency, { source = "manual", employee_id = null } = {}) {
  const rate = parseFloat(currency?.exchange_rate);
  if (!currency?.company_id || currency.is_base || !(rate > 0)) return;
  try {
    await sequelize.query(`
      INSERT INTO currency_rates (company_id, currency_id, rate_date, rate, source, employee_id, updated_at)
      VALUES (:company_id, :currency_id, :day, :rate, :source, :employee_id, NOW())
      ON CONFLICT (company_id, currency_id, rate_date)
      DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source,
                    employee_id = EXCLUDED.employee_id, updated_at = NOW()
    `, { replacements: { company_id: currency.company_id, currency_id: currency.id, day: hoy(), rate, source, employee_id } });
  } catch (e) {
    console.error("[currencyRates] no se guardó en el historial:", e.message);
  }
}

/**
 * Tasa de cada moneda no base para un día. Hoy (o después) es la cargada ahora mismo; un día
 * pasado, la del historial. `rate: null` si no hay nada guardado hasta esa fecha: la pantalla
 * avisa y sigue con la de hoy.
 */
async function ratesOn(companyId, date) {
  if (!companyId) throw fail("Elige una empresa para consultar la tasa");
  const day = DAY.test(String(date || "")) ? String(date) : hoy();
  const today = hoy();
  const currencies = await sequelize.query(`
    SELECT id, code, exchange_rate FROM currencies
     WHERE company_id = :companyId AND NOT is_base
  `, { replacements: { companyId }, type: Sequelize.QueryTypes.SELECT });

  if (day >= today) {
    return { date: day, today, rates: currencies.map(c => ({
      currency_id: c.id, code: c.code, rate: parseFloat(c.exchange_rate), rate_date: today, source: "actual",
    })) };
  }

  const rows = await sequelize.query(`
    SELECT DISTINCT ON (currency_id) currency_id, rate, rate_date, source
      FROM currency_rates
     WHERE company_id = :companyId AND rate_date <= :day
     ORDER BY currency_id, rate_date DESC
  `, { replacements: { companyId, day }, type: Sequelize.QueryTypes.SELECT });
  const byId = new Map(rows.map(r => [r.currency_id, r]));
  return { date: day, today, rates: currencies.map(c => {
    const r = byId.get(c.id);
    return {
      currency_id: c.id, code: c.code,
      rate: r ? parseFloat(r.rate) : null,
      rate_date: r ? String(r.rate_date).slice(0, 10) : null,
      source: r?.source || null,
    };
  }) };
}

/** Días guardados de una moneda, del más nuevo al más viejo, con quién la cargó. */
async function history(companyId, { currency_id, from, to, limit = 60 } = {}) {
  if (!companyId) throw fail("Elige una empresa para ver el historial");
  const cid = parseInt(currency_id);
  if (!cid) throw fail("Falta la moneda");
  const lim = Math.min(Math.max(parseInt(limit) || 60, 1), 400);
  return sequelize.query(`
    SELECT r.rate_date, r.rate, r.source, r.updated_at, e.full_name AS employee_name
      FROM currency_rates r
      LEFT JOIN employees e ON e.id = r.employee_id
     WHERE r.company_id = :companyId AND r.currency_id = :cid
       ${DAY.test(String(from || "")) ? "AND r.rate_date >= :from" : ""}
       ${DAY.test(String(to || "")) ? "AND r.rate_date <= :to" : ""}
     ORDER BY r.rate_date DESC
     LIMIT ${lim}
  `, { replacements: { companyId, cid, from, to }, type: Sequelize.QueryTypes.SELECT })
    .then(rows => rows.map(r => ({ ...r, rate_date: String(r.rate_date).slice(0, 10), rate: parseFloat(r.rate) })));
}

/**
 * Corrige o completa la tasa de un día PASADO. Hoy no se toca por acá: la de hoy es la de
 * Monedas, y tener dos lugares para cambiarla dejaría el historial y la tasa vigente distintos.
 * No mueve cobros ya registrados: cada uno guardó su tasa.
 */
async function setDayRate(companyId, { currency_id, date, rate, employee_id }) {
  if (!companyId) throw fail("Elige una empresa");
  const cid = parseInt(currency_id);
  const r = parseFloat(String(rate ?? "").replace(",", "."));
  if (!cid) throw fail("Falta la moneda");
  if (!DAY.test(String(date || ""))) throw fail("Fecha inválida");
  if (!(r > 0)) throw fail("Tasa inválida");
  if (date >= hoy()) throw fail("La tasa de hoy se cambia en Monedas");
  const [cur] = await sequelize.query(
    `SELECT id FROM currencies WHERE id = :cid AND company_id = :companyId AND NOT is_base`,
    { replacements: { cid, companyId }, type: Sequelize.QueryTypes.SELECT });
  if (!cur) throw fail("Moneda no encontrada", 404);
  await sequelize.query(`
    INSERT INTO currency_rates (company_id, currency_id, rate_date, rate, source, employee_id, updated_at)
    VALUES (:companyId, :cid, :date, :r, 'correccion', :employee_id, NOW())
    ON CONFLICT (company_id, currency_id, rate_date)
    DO UPDATE SET rate = EXCLUDED.rate, source = 'correccion', employee_id = EXCLUDED.employee_id, updated_at = NOW()
  `, { replacements: { companyId, cid, date, r, employee_id: employee_id || null } });
  return { currency_id: cid, rate_date: date, rate: r, source: "correccion" };
}

module.exports = { recordRate, ratesOn, history, setDayRate, hoy };
