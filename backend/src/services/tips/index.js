'use strict';

const { sequelize, Sequelize, Seller, Setting, Company, Sale, TipPayout, TipReassignment, Expense, ExpenseCategory, Warehouse } = require("../../models");
const { sanitizeDate, dateClauseOn, localDate, DISPATCHED_SQL } = require("../reports/shared");
const { toLocalDate } = require("../../utils/localDate");
const { resolveMethod } = require("../../utils/journalMethod");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { assertJournalsInWarehouse } = require("../../utils/journalWarehouse");
const { listSellers } = require("../commissions");

// Propinas (ver migración 20261121120000-propinas). Decisiones del dueño del restaurante:
//  - La propina es el recargo de la factura marcado como propina (sales.service_charge_is_tip).
//  - Le toca a una persona (sales.tip_seller_id, de la lista de Comisiones) o al POZO
//    (sales.tip_pool, copiado del ajuste `propinas_reparto` al cobrar). En modo pozo la persona se
//    sigue anotando: dice quién atendió, y con eso se preselecciona el reparto.
//  - Se gana al COBRAR, con el mismo modelo de eventos de las comisiones (services/commissions):
//    por factura C(t) = min(cobrado, por saldar), y la propina de cada evento es lo que C sube o
//    baja por la parte de la factura que es propina (service_charge / total). Un abono del 50 %
//    paga media propina; una devolución después de cobrar la resta ese día.
//  - Se paga con un egreso (categoría "Propinas"). Un reparto del pozo es UN egreso con una fila
//    por persona (tip_payouts.from_pool). Anular el egreso en Contabilidad deshace el pago.
//  - Corregir a quién le toca (tip_reassignments) vale aun con la factura cerrada: la propina
//    entera de esa factura pasa a la otra persona, también la ya cobrada. Si ya se le había
//    pagado a la anterior, le queda saldo en contra.

const CATEGORIA = "Propinas";
const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const r5 = (n) => Math.round((parseFloat(n) || 0) * 1e5) / 1e5;
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const q = (sql, replacements, transaction) => sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT, transaction });

// Pagos que cuentan: los de egreso vivo.
const PAGO_VIVO = `EXISTS (SELECT 1 FROM expenses e WHERE e.id = tp.expense_id AND e.status <> 'anulado')`;

// ── Ajustes de la empresa ────────────────────────────────────────────────────

async function propinasActivas(companyId, transaction) {
  if (!companyId) return false;
  const c = await Company.findByPk(companyId, { attributes: ["propinas_enabled"], transaction });
  return !!c?.propinas_enabled;
}

// 'mesonero' (por defecto) o 'pozo'.
async function modoReparto(companyId, transaction) {
  const s = await Setting.findOne({ where: { company_id: companyId, key: "propinas_reparto" }, attributes: ["value"], transaction });
  return s?.value === "pozo" ? "pozo" : "mesonero";
}

// Persona de la lista ligada al usuario del mesonero (sellers.employee_id), activa.
async function personaDeUsuario(employeeId, transaction) {
  if (!employeeId) return null;
  const s = await Seller.findOne({ where: { employee_id: employeeId, active: true }, attributes: ["id"], order: [["id", "ASC"]], transaction });
  return s?.id || null;
}

/**
 * Lo que una venta guarda de la propina, para createSale y updateSale. Solo con el extra encendido.
 *   body.service_charge_is_tip  – el recargo es propina
 *   body.tip_seller_id          – a quién le toca (null = a nadie todavía)
 *   waiterId                    – el mesonero que abrió la cuenta en la tablet (si no vino persona)
 *   cobrando                    – la venta se factura ahora: se copia el modo (persona o pozo)
 */
async function propinaDeVenta(body, { companyId, sale = null, waiterId = null, cobrando = false, offline = false, transaction }) {
  const tocaTip = body.service_charge_is_tip !== undefined;
  const tocaPersona = body.tip_seller_id !== undefined;
  if (!tocaTip && !tocaPersona && !waiterId && !cobrando) return {};
  if (!(await propinasActivas(companyId, transaction))) return {};

  const patch = {};
  if (tocaTip) patch.service_charge_is_tip = !!body.service_charge_is_tip;
  if (tocaPersona) {
    const id = parseInt(body.tip_seller_id, 10) || null;
    if (id) {
      const s = await Seller.findByPk(id, { attributes: ["id", "active", "name"], transaction });
      if (!s && !offline) throw fail("Esa persona ya no está en la lista de propinas");
      if (s && !s.active && !offline && id !== sale?.tip_seller_id) throw fail(`${s.name} está inactivo: elige a otra persona`);
      patch.tip_seller_id = s ? s.id : null;
    } else {
      patch.tip_seller_id = null;
    }
  } else if (!sale?.tip_seller_id && waiterId) {
    const id = await personaDeUsuario(waiterId, transaction);
    if (id) patch.tip_seller_id = id;
  }
  if (cobrando) patch.tip_pool = (await modoReparto(companyId, transaction)) === "pozo";
  return patch;
}

// La ronda de un mesonero sobre una cuenta que no tenía a quién darle la propina: queda él.
async function asignarMesonero(sale, employeeId) {
  if (!sale || sale.tip_seller_id || !employeeId) return;
  if (!(await propinasActivas(sale.company_id))) return;
  const id = await personaDeUsuario(employeeId);
  if (id) await Sale.update({ tip_seller_id: id }, { where: { id: sale.id } });
}

// ── Eventos ──────────────────────────────────────────────────────────────────

// Mismo modelo que las comisiones, con la parte de la factura que es propina. Deja `te` con:
// sale_id, seller_id, pool, at, kind, ord, tip (propina que entró o salió) y pend (la que falta
// cobrar, en la última fila de cada factura).
const eventos = (filtro) => `
  v AS (
    SELECT s.id, s.tip_seller_id, s.tip_pool, s.created_at, s.total, s.credit_applied, s.fx_forgiven,
           s.forgiven_amount, s.forgiven_at,
           CASE WHEN s.total > 0 THEN LEAST(COALESCE(s.service_charge, 0), s.total) / s.total ELSE 0 END AS f
      FROM sales s
     WHERE s.company_id = :cid AND s.service_charge_is_tip AND s.service_charge > 0
       AND s.status IN (${DISPATCHED_SQL}) ${filtro}
  ),
  ev AS (
    SELECT id AS sale_id, created_at AS at, 0 AS prio, 0 AS ord, 'venta' AS kind,
           GREATEST(total - fx_forgiven, 0) AS d_ref, COALESCE(credit_applied, 0) AS d_cob,
           tip_seller_id AS r_seller, tip_pool AS r_pool, f AS r_f
      FROM v
    UNION ALL
    SELECT p.sale_id, p.created_at, 1, p.id, 'cobro', 0,
           p.amount - CASE WHEN p.change_journal_id IS NOT NULL THEN COALESCE(p.change_given, 0) ELSE 0 END,
           NULL, NULL, NULL
      FROM payments p
     WHERE p.sale_id IN (SELECT id FROM v) AND p.payment_journal_id IS NOT NULL AND p.amount > 0
    UNION ALL
    SELECT r.sale_id, r.created_at, 2, r.id, 'devolucion', -r.total, 0, NULL, NULL, NULL
      FROM returns r
     WHERE r.sale_id IN (SELECT id FROM v) AND r.status <> 'anulado'
    UNION ALL
    SELECT id, forgiven_at, 3, 0, 'exonerado', -(forgiven_amount - fx_forgiven), 0, NULL, NULL, NULL
      FROM v WHERE forgiven_at IS NOT NULL AND forgiven_amount - fx_forgiven > 0.000001
  ),
  ac AS (
    SELECT sale_id, at, prio, ord, kind,
           MAX(r_seller) OVER p AS seller_id, BOOL_OR(r_pool) OVER p AS pool, MAX(r_f) OVER p AS f,
           SUM(d_ref) OVER w AS ref,
           GREATEST(LEAST(SUM(d_cob) OVER w, SUM(d_ref) OVER w), 0) AS c,
           ROW_NUMBER() OVER (PARTITION BY sale_id ORDER BY at DESC, prio DESC, ord DESC) AS desde_el_final
      FROM ev
    WINDOW p AS (PARTITION BY sale_id),
           w AS (PARTITION BY sale_id ORDER BY at, prio, ord ROWS UNBOUNDED PRECEDING)
  ),
  te AS (
    SELECT sale_id, seller_id, pool, at, kind, ord,
           (c - COALESCE(LAG(c) OVER (PARTITION BY sale_id ORDER BY at, prio, ord), 0)) * f AS tip,
           CASE WHEN desde_el_final = 1 THEN GREATEST(ref - c, 0) * f ELSE 0 END AS pend
      FROM ac
  )`;

// Lo que se le debe hoy a una persona (sin el pozo) y lo que queda en el pozo.
async function saldoPersona(sellerId, companyId, transaction) {
  const [row] = await q(`
    WITH ${eventos("AND s.tip_seller_id = :sid")}
    SELECT COALESCE((SELECT SUM(tip) FROM te WHERE NOT pool), 0)::float AS ganado,
           COALESCE((SELECT SUM(tp.amount) FROM tip_payouts tp WHERE tp.seller_id = :sid AND NOT tp.from_pool AND ${PAGO_VIVO}), 0)::float AS pagado`,
    { cid: companyId, sid: sellerId }, transaction);
  return r2((row?.ganado || 0) - (row?.pagado || 0));
}

async function saldoPozo(companyId, transaction) {
  const [row] = await q(`
    WITH ${eventos("AND s.tip_pool")}
    SELECT COALESCE((SELECT SUM(tip) FROM te), 0)::float AS ganado,
           COALESCE((SELECT SUM(tp.amount) FROM tip_payouts tp WHERE tp.company_id = :cid AND tp.from_pool AND ${PAGO_VIVO}), 0)::float AS repartido`,
    { cid: companyId }, transaction);
  return { ganado: r2(row?.ganado), repartido: r2(row?.repartido), saldo: r2((row?.ganado || 0) - (row?.repartido || 0)) };
}

// ── Reporte del período ──────────────────────────────────────────────────────

async function report({ company_id, date_from, date_to, warehouse_id, wh }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const wid = parseInt(warehouse_id) || null;
  const filtro = wid ? `AND s.warehouse_id = ${wid}` : wh("s");
  const rep = { cid: company_id };

  const [personas, filas, pagos, pozo, atendio, modo] = await Promise.all([
    listSellers({ all: true }),
    q(`WITH ${eventos(filtro)}
       SELECT seller_id, pool,
              COALESCE(SUM(tip) FILTER (WHERE TRUE ${dateClauseOn(df, dt, "at")}), 0)::float AS periodo,
              COALESCE(SUM(tip), 0)::float AS ganado,
              COALESCE(SUM(pend), 0)::float AS por_cobrar
         FROM te GROUP BY seller_id, pool`, rep),
    q(`SELECT tp.seller_id, tp.from_pool, COALESCE(SUM(tp.amount), 0)::float AS pagado, MAX(tp.paid_at) AS ultimo
         FROM tip_payouts tp
        WHERE tp.company_id = :cid AND ${PAGO_VIVO}
        GROUP BY tp.seller_id, tp.from_pool`, rep),
    saldoPozo(company_id),
    // Quién atendió cuentas con propina en el período: con eso se preselecciona el reparto.
    q(`SELECT s.tip_seller_id AS seller_id, COUNT(*)::int AS cuentas
         FROM sales s
        WHERE s.company_id = :cid AND s.service_charge_is_tip AND s.service_charge > 0 AND s.tip_seller_id IS NOT NULL
              AND s.status IN (${DISPATCHED_SQL}) ${filtro} ${dateClauseOn(df, dt, "s.created_at")}
        GROUP BY s.tip_seller_id`, rep),
    modoReparto(company_id),
  ]);

  const directa = new Map(), pagado = new Map(), delPozo = new Map(), cuentas = new Map(atendio.map(a => [a.seller_id, a.cuentas]));
  let pozoPeriodo = 0, pozoPorCobrar = 0;
  for (const f of filas) {
    if (f.pool) { pozoPeriodo += f.periodo; pozoPorCobrar += f.por_cobrar; continue; }
    if (f.seller_id == null) continue;
    directa.set(f.seller_id, f);
  }
  for (const p of pagos) (p.from_pool ? delPozo : pagado).set(p.seller_id, p);
  // Propinas directas que no tienen a quién (la caja no eligió persona y no es pozo).
  const sinPersona = filas.filter(f => !f.pool && f.seller_id == null).reduce((a, f) => ({ periodo: a.periodo + f.periodo, ganado: a.ganado + f.ganado }), { periodo: 0, ganado: 0 });

  const data = personas.map(s => {
    const d = directa.get(s.id) || {}, p = pagado.get(s.id) || {}, dp = delPozo.get(s.id) || {};
    const ganado = d.ganado || 0, pag = p.pagado || 0;
    return {
      id: s.id, code: s.code, name: s.name, active: s.active, employee_id: s.employee_id, warehouse_id: s.warehouse_id,
      periodo: r2(d.periodo),
      por_cobrar: r2(d.por_cobrar),
      ganado: r2(ganado),
      pagado: r2(pag),
      saldo: r2(ganado - pag),
      del_pozo: r2(dp.pagado),
      cuentas: cuentas.get(s.id) || 0,
      ultimo_pago: [p.ultimo, dp.ultimo].filter(Boolean).sort().pop() || null,
    };
  }).filter(s => s.active || s.periodo || Math.abs(s.saldo) >= 0.005 || s.cuentas);

  const sum = (k) => r2(data.reduce((a, s) => a + (s[k] || 0), 0));
  return {
    modo,
    data,
    pool: { periodo: r2(pozoPeriodo), por_cobrar: r2(pozoPorCobrar), ...pozo },
    sin_persona: { periodo: r2(sinPersona.periodo), ganado: r2(sinPersona.ganado) },
    totals: { periodo: r2(sum("periodo") + pozoPeriodo + sinPersona.periodo), saldo: sum("saldo"), por_cobrar: r2(sum("por_cobrar") + pozoPorCobrar) },
  };
}

// ── Estado de cuenta de una persona ──────────────────────────────────────────

async function statement(sellerId, { company_id, date_from, date_to }) {
  const seller = await Seller.findByPk(sellerId);
  if (!seller) throw fail("Persona no encontrada", 404);
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const rep = { cid: company_id, sid: seller.id };
  const dia = localDate("e.at");

  const [movs, previo, pagos, pendientes] = await Promise.all([
    q(`WITH ${eventos("AND s.tip_seller_id = :sid AND NOT s.tip_pool")}
       SELECT e.sale_id, e.kind, e.at, ${dia} AS day, e.tip::float AS tip,
              s.invoice_number, s.service_charge::float AS sale_tip, c.name AS customer_name, t.name AS table_name
         FROM te e
         JOIN sales s ON s.id = e.sale_id
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN dining_tables t ON t.id = s.table_id
        WHERE ABS(e.tip) >= 0.000005 ${dateClauseOn(df, dt, "e.at")}
        ORDER BY e.at, e.sale_id, e.ord`, rep),
    df
      ? q(`WITH ${eventos("AND s.tip_seller_id = :sid AND NOT s.tip_pool")}
           SELECT COALESCE((SELECT SUM(tip) FROM te WHERE ${localDate("at")} < '${df}'::date), 0)::float AS ganado,
                  COALESCE((SELECT SUM(tp.amount) FROM tip_payouts tp
                             WHERE tp.seller_id = :sid AND NOT tp.from_pool AND tp.paid_at < '${df}'::date AND ${PAGO_VIVO}), 0)::float AS pagado`, rep)
      : Promise.resolve([{ ganado: 0, pagado: 0 }]),
    q(`SELECT tp.id, tp.amount::float AS amount, tp.from_pool, tp.paid_at, tp.period_from, tp.period_to, tp.notes, tp.expense_id,
              COALESCE(e.rate, 1)::float AS rate, e.amount::float AS expense_amount, e.reference,
              j.name AS journal_name, cu.symbol AS currency_symbol,
              (e.id IS NOT NULL AND e.status <> 'anulado') AS vivo
         FROM tip_payouts tp
         LEFT JOIN expenses e ON e.id = tp.expense_id
         LEFT JOIN payment_journals j ON j.id = e.payment_journal_id
         LEFT JOIN currencies cu ON cu.id = e.currency_id
        WHERE tp.seller_id = :sid
              ${df ? `AND tp.paid_at >= '${df}'::date` : ""} ${dt ? `AND tp.paid_at <= '${dt}'::date` : ""}
        ORDER BY tp.paid_at, tp.id`, rep),
    q(`WITH ${eventos("AND s.tip_seller_id = :sid AND NOT s.tip_pool")}
       SELECT e.sale_id, e.pend::float AS pend, s.invoice_number, s.created_at, c.name AS customer_name
         FROM te e
         JOIN sales s ON s.id = e.sale_id
         LEFT JOIN customers c ON c.id = s.customer_id
        WHERE e.pend >= 0.005
        ORDER BY s.created_at`, rep),
  ]);

  const apertura = (previo[0]?.ganado || 0) - (previo[0]?.pagado || 0);
  const ganado = movs.reduce((a, m) => a + m.tip, 0);
  const pagado = pagos.filter(p => p.vivo && !p.from_pool).reduce((a, p) => a + p.amount, 0);
  return {
    seller: { id: seller.id, code: seller.code, name: seller.name },
    balance: await saldoPersona(seller.id, company_id),
    opening: r2(apertura),
    earned: r2(ganado),
    paid: r2(pagado),
    closing: r2(apertura + ganado - pagado),
    from_pool: r2(pagos.filter(p => p.vivo && p.from_pool).reduce((a, p) => a + p.amount, 0)),
    movements: movs.map(m => ({ ...m, tip: r5(m.tip) })),
    payouts: pagos,
    pending: pendientes.map(p => ({ ...p, pend: r2(p.pend) })),
    pending_total: r2(pendientes.reduce((a, p) => a + p.pend, 0)),
  };
}

// ── Facturas con propina (para corregir a quién le toca) ─────────────────────

async function sales({ company_id, date_from, date_to, warehouse_id, wh, seller_id }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const wid = parseInt(warehouse_id) || null;
  const sid = parseInt(seller_id) || null;
  const filtro = `${wid ? `AND s.warehouse_id = ${wid}` : wh("s")} ${sid ? `AND s.tip_seller_id = ${sid}` : ""}`;
  const filas = await q(`
    SELECT s.id, s.invoice_number, s.created_at, s.status, s.total::float AS total,
           s.service_charge::float AS tip, s.service_charge_label AS label, s.tip_seller_id, s.tip_pool,
           sel.name AS seller_name, sel.code AS seller_code, c.name AS customer_name, t.name AS table_name,
           w.full_name AS waiter_name,
           (SELECT COUNT(*) FROM tip_reassignments r WHERE r.sale_id = s.id)::int AS cambios
      FROM sales s
      LEFT JOIN sellers sel ON sel.id = s.tip_seller_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN dining_tables t ON t.id = s.table_id
      LEFT JOIN employees w ON w.id = s.waiter_id
     WHERE s.company_id = :cid AND s.service_charge_is_tip AND s.service_charge > 0
       AND s.status IN (${DISPATCHED_SQL}) ${filtro} ${dateClauseOn(df, dt, "s.created_at")}
     ORDER BY s.created_at DESC
     LIMIT 500`, { cid: company_id });
  return { data: filas.map(f => ({ ...f, tip: r2(f.tip), total: r2(f.total) })) };
}

async function history(saleId) {
  const filas = await q(`
    SELECT r.id, r.created_at, r.reason, r.from_pool, r.to_pool,
           fs.name AS from_name, ts.name AS to_name, e.full_name AS employee_name
      FROM tip_reassignments r
      LEFT JOIN sellers fs ON fs.id = r.from_seller_id
      LEFT JOIN sellers ts ON ts.id = r.to_seller_id
      LEFT JOIN employees e ON e.id = r.employee_id
     WHERE r.sale_id = :id
     ORDER BY r.created_at DESC`, { id: parseInt(saleId) || 0 });
  return { data: filas };
}

/**
 * Cambia a quién le toca la propina de una factura, aunque ya esté cerrada (permiso tips.reassign).
 * body: { tip_seller_id: number | null, to_pool?: boolean, reason? }
 */
async function reassign(saleId, body, req) {
  return sequelize.transaction(async (transaction) => {
    const sale = await Sale.findOne({ where: { id: parseInt(saleId) || 0 }, transaction, lock: true });
    if (!sale) throw fail("Factura no encontrada", 404);
    await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });
    if (!sale.service_charge_is_tip || !(parseFloat(sale.service_charge) > 0)) throw fail("Esa factura no tiene propina");

    const alPozo = !!body.to_pool;
    const destino = alPozo ? (sale.tip_seller_id || null) : (parseInt(body.tip_seller_id) || null);
    if (!alPozo && !destino) throw fail("Elige a quién le toca la propina");
    if (destino && destino !== sale.tip_seller_id) {
      const s = await Seller.findByPk(destino, { attributes: ["id", "active", "name"], transaction });
      if (!s) throw fail("Esa persona ya no existe");
      if (!s.active) throw fail(`${s.name} está inactivo`);
    }
    if (destino === (sale.tip_seller_id || null) && alPozo === !!sale.tip_pool) throw fail("La propina ya es de esa persona");

    await TipReassignment.create({
      sale_id: sale.id,
      from_seller_id: sale.tip_seller_id || null,
      to_seller_id: destino,
      from_pool: !!sale.tip_pool,
      to_pool: alPozo,
      reason: String(body.reason ?? "").trim().slice(0, 300) || null,
      employee_id: req.employee?.id || null,
    }, { transaction });
    await sale.update({ tip_seller_id: destino, tip_pool: alPozo }, { transaction });
    return { data: { sale_id: sale.id, tip_seller_id: destino, tip_pool: alPozo } };
  });
}

// ── Pagar ────────────────────────────────────────────────────────────────────

async function egreso({ company_id, amount, description, body, warehouse_id, req, transaction }) {
  const [cat] = await ExpenseCategory.findOrCreate({
    where: { name: CATEGORIA, company_id },
    defaults: { name: CATEGORIA, active: true, company_id },
    transaction,
  });
  const metodo = await resolveMethod(body.payment_journal_id, body.payment_method, "out");
  return Expense.create({
    description,
    amount,
    currency_id: body.currency_id || null,
    rate: parseFloat(body.exchange_rate) || 1,
    category_id: cat.id,
    payment_journal_id: body.payment_journal_id,
    payment_method: metodo,
    reference: String(body.reference ?? "").trim().slice(0, 50) || null,
    notes: String(body.notes ?? "").trim().slice(0, 300) || null,
    employee_id: req.employee.id,
    company_id,
    warehouse_id,
    status: "activo",
    date: toLocalDate(sanitizeDate(body.date) || null),
  }, { transaction });
}

async function validarSalida(body, req) {
  if (!body.payment_journal_id) throw fail("Elige de qué caja o banco sale el pago");
  const warehouse_id = parseInt(body.warehouse_id);
  if (!warehouse_id) throw fail("Falta la sucursal del egreso");
  await assertWarehouseAccess(req, warehouse_id);
  const almacen = await Warehouse.findByPk(warehouse_id, { attributes: ["id", "name", "sells"] });
  if (almacen && almacen.sells === false) throw fail(`${almacen.name} es un depósito: los movimientos se registran en un punto de venta`);
  return warehouse_id;
}

// Paga a una persona lo que le toca de sus propinas (sin el pozo).
async function createPayout(sellerId, body, req) {
  const company_id = req.company_id;
  const amount = r5(body.amount);
  if (!(amount > 0)) throw fail("El monto debe ser mayor a 0");
  const warehouse_id = await validarSalida(body, req);
  const seller = await Seller.findByPk(sellerId);
  if (!seller) throw fail("Persona no encontrada", 404);

  return sequelize.transaction(async (transaction) => {
    await assertJournalsInWarehouse(body.payment_journal_id, warehouse_id, transaction);
    await sequelize.query("SELECT id FROM sellers WHERE id = :id FOR UPDATE", { replacements: { id: seller.id }, transaction });
    const saldo = await saldoPersona(seller.id, company_id, transaction);
    if (amount > saldo + 0.01) throw fail(`Pasa de lo que se le debe (Ref. ${saldo.toFixed(2)})`);
    const expense = await egreso({ company_id, amount, description: `Propinas — ${seller.name} (${seller.code})`, body, warehouse_id, req, transaction });
    const payout = await TipPayout.create({
      company_id, seller_id: seller.id, amount, from_pool: false, expense_id: expense.id,
      paid_at: sanitizeDate(body.date) || localHoy(),
      notes: String(body.notes ?? "").trim().slice(0, 300) || null,
      employee_id: req.employee.id,
    }, { transaction });
    return { payout, expense_id: expense.id, balance: r2(saldo - amount) };
  });
}

/**
 * Reparte el pozo: un egreso por el total y una fila por persona.
 * body: { shares: [{ seller_id, amount }], period_from?, period_to?, payment_journal_id, … }
 */
async function createPoolPayout(body, req) {
  const company_id = req.company_id;
  const partes = (Array.isArray(body.shares) ? body.shares : [])
    .map(s => ({ seller_id: parseInt(s.seller_id), amount: r5(s.amount) }))
    .filter(s => s.seller_id && s.amount > 0);
  if (!partes.length) throw fail("Elige entre quiénes se reparte");
  if (new Set(partes.map(p => p.seller_id)).size !== partes.length) throw fail("Una persona está repetida en el reparto");
  const total = r5(partes.reduce((a, p) => a + p.amount, 0));
  const warehouse_id = await validarSalida(body, req);

  const personas = await Seller.findAll({ where: { id: partes.map(p => p.seller_id) }, attributes: ["id", "name"] });
  if (personas.length !== partes.length) throw fail("Una de las personas ya no existe");

  return sequelize.transaction(async (transaction) => {
    await assertJournalsInWarehouse(body.payment_journal_id, warehouse_id, transaction);
    // Dos repartos a la vez repartirían dos veces el mismo pozo.
    await sequelize.query("SELECT pg_advisory_xact_lock(:k)", { replacements: { k: 7_300_000 + company_id }, transaction });
    const pozo = await saldoPozo(company_id, transaction);
    if (total > pozo.saldo + 0.01) throw fail(`Pasa de lo que hay en el pozo (Ref. ${pozo.saldo.toFixed(2)})`);
    const expense = await egreso({
      company_id, amount: total,
      description: `Propinas — reparto del pozo (${partes.length} ${partes.length === 1 ? "persona" : "personas"})`,
      body, warehouse_id, req, transaction,
    });
    const paidAt = sanitizeDate(body.date) || localHoy();
    for (const p of partes) {
      await TipPayout.create({
        company_id, seller_id: p.seller_id, amount: p.amount, from_pool: true, expense_id: expense.id,
        paid_at: paidAt,
        period_from: sanitizeDate(body.period_from) || null,
        period_to: sanitizeDate(body.period_to) || null,
        notes: String(body.notes ?? "").trim().slice(0, 300) || null,
        employee_id: req.employee.id,
      }, { transaction });
    }
    return { expense_id: expense.id, total: r2(total), pool_balance: r2(pozo.saldo - total) };
  });
}

// Anular un pago es anular su egreso. En un reparto del pozo se anulan todas sus filas a la vez.
async function voidPayout(payoutId, req) {
  const payout = await TipPayout.findByPk(payoutId);
  if (!payout) throw fail("Pago no encontrado", 404);
  const expense = payout.expense_id ? await Expense.findByPk(payout.expense_id) : null;
  if (!expense || expense.status === "anulado") throw fail("Ese pago ya está anulado");
  await assertWarehouseAccess(req, expense.warehouse_id, { optional: true });
  await expense.update({ status: "anulado" });
  return { ok: true };
}

function localHoy() {
  const { TZ } = require("../reports/shared");
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

module.exports = {
  propinasActivas, modoReparto, propinaDeVenta, asignarMesonero,
  report, statement, sales, history, reassign, createPayout, createPoolPayout, voidPayout,
};
