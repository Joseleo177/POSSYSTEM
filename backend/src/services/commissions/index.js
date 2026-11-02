'use strict';

const { sequelize, Sequelize, Seller, CommissionPayout, Expense, ExpenseCategory, Warehouse } = require("../../models");
const { sanitizeDate, dateClauseOn, localDate, DISPATCHED_SQL } = require("../reports/shared");
const { toLocalDate } = require("../../utils/localDate");
const { resolveMethod } = require("../../utils/journalMethod");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { assertJournalsInWarehouse } = require("../../utils/journalWarehouse");

// Comisiones por vendedor (ver migración 20261105100000-comisiones).
//
// Se gana al COBRAR, decisión del dueño de la joyería que lo pidió: una venta a crédito no paga
// comisión hasta que entra el dinero, y un abono del 50% paga la mitad. La base es lo cobrado
// SIN recargos (delivery, servicio): esa parte de la factura no es mercancía que se vendió.
//
// El modelo, por factura y en orden de tiempo:
//  - ref   = lo que hay que saldar: total − rebaja por divisas (fx_forgiven), y le restan las
//            devoluciones vivas y lo exonerado el día en que pasan.
//  - cob   = lo que entró: cobros (menos el vuelto que salió de otra caja, la regla de
//            getSaleBalance) y el saldo a favor aplicado, que entra el día de la venta.
//  - C(t)  = min(cob, ref): el dinero cobrado que la factura se queda. La comisión de cada
//            evento es lo que C sube (o baja) en él, por la parte sin recargos y por el % que
//            se copió en la venta.
// Así una devolución después de cobrar RESTA el día de la devolución (C baja); una devolución
// antes de cobrar no resta nada (C nunca llegó tan alto); lo que pasa del total (el sobrante
// que quedó a favor o se reembolsó) no cuenta, y lo exonerado no paga comisión.
//
// RENDIMIENTO: como en marginsReport, ningún paso cruza dos CTE con JOIN. Lo que cada evento
// necesita de su factura (vendedor, %, parte sin recargos) viaja en la fila de la factura y se
// reparte con funciones de ventana.

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const r5 = (n) => Math.round((parseFloat(n) || 0) * 1e5) / 1e5;
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

// Eventos de comisión de las facturas con vendedor. `filtro` recorta las facturas (vendedor,
// sucursal). Deja un CTE `ce` con: sale_id, seller_id, at, kind, ord, base (dinero comisionable
// que entró o salió) y commission, más `pend`, la comisión que falta por cobrar, en la última
// fila de cada factura.
const eventos = (filtro) => `
  v AS (
    SELECT s.id, s.seller_id, s.created_at, s.total, s.credit_applied, s.fx_forgiven,
           s.forgiven_amount, s.forgiven_at,
           COALESCE(s.seller_pct, 0) AS pct,
           CASE WHEN s.total > 0 THEN GREATEST(s.total - COALESCE(s.service_charge, 0), 0) / s.total ELSE 0 END AS f
      FROM sales s
     WHERE s.company_id = :cid AND s.seller_id IS NOT NULL AND s.status IN (${DISPATCHED_SQL}) ${filtro}
  ),
  ev AS (
    SELECT id AS sale_id, created_at AS at, 0 AS prio, 0 AS ord, 'venta' AS kind,
           GREATEST(total - fx_forgiven, 0) AS d_ref, COALESCE(credit_applied, 0) AS d_cob,
           seller_id AS r_seller, pct AS r_pct, f AS r_f
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
           MAX(r_seller) OVER p AS seller_id, MAX(r_pct) OVER p AS pct, MAX(r_f) OVER p AS f,
           SUM(d_ref) OVER w AS ref,
           GREATEST(LEAST(SUM(d_cob) OVER w, SUM(d_ref) OVER w), 0) AS c,
           ROW_NUMBER() OVER (PARTITION BY sale_id ORDER BY at DESC, prio DESC, ord DESC) AS desde_el_final
      FROM ev
    WINDOW p AS (PARTITION BY sale_id),
           w AS (PARTITION BY sale_id ORDER BY at, prio, ord ROWS UNBOUNDED PRECEDING)
  ),
  ce AS (
    SELECT sale_id, seller_id, at, kind, ord,
           (c - COALESCE(LAG(c) OVER (PARTITION BY sale_id ORDER BY at, prio, ord), 0)) * f AS base,
           (c - COALESCE(LAG(c) OVER (PARTITION BY sale_id ORDER BY at, prio, ord), 0)) * f * pct / 100 AS commission,
           CASE WHEN desde_el_final = 1 THEN GREATEST(ref - c, 0) * f * pct / 100 ELSE 0 END AS pend
      FROM ac
  )`;

// Liquidaciones que cuentan: las de egreso vivo. Anular el egreso en Contabilidad deshace la
// liquidación; si después se borra el egreso anulado, expense_id queda nulo y tampoco cuenta.
const PAGO_VIVO = `EXISTS (SELECT 1 FROM expenses e WHERE e.id = cp.expense_id AND e.status <> 'anulado')`;

const q = (sql, replacements) => sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });

// ── Vendedores ───────────────────────────────────────────────────────────────

async function listSellers({ all = false } = {}) {
  const rows = await Seller.findAll({
    where: all ? {} : { active: true },
    order: [["active", "DESC"], ["code", "ASC"], ["name", "ASC"]],
  });
  return rows.map(s => ({ ...s.toJSON(), commission_pct: parseFloat(s.commission_pct) }));
}

async function saveSeller(id, body) {
  const code = String(body.code ?? "").trim().slice(0, 10);
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!code) throw fail("El código es obligatorio: es lo que se teclea en la caja");
  if (!name) throw fail("El nombre es obligatorio");
  const pct = parseFloat(String(body.commission_pct ?? "").replace(",", "."));
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw fail("La comisión va de 0 a 100 %");

  const { Op } = Sequelize;
  const repetido = await Seller.findOne({
    where: {
      [Op.and]: [
        Sequelize.where(Sequelize.fn("lower", Sequelize.col("code")), code.toLowerCase()),
        ...(id ? [{ id: { [Op.ne]: id } }] : []),
      ],
    },
    attributes: ["id", "name"],
  });
  if (repetido) throw fail(`El código ${code} ya es de ${repetido.name}`, 409);

  const datos = {
    code, name,
    doc_id: String(body.doc_id ?? "").trim().slice(0, 20) || null,
    phone: String(body.phone ?? "").trim().slice(0, 30) || null,
    commission_pct: r2(pct),
    warehouse_id: parseInt(body.warehouse_id) || null,
    employee_id: parseInt(body.employee_id) || null,
    active: body.active !== false,
  };
  if (!id) return Seller.create(datos);
  const seller = await Seller.findByPk(id);
  if (!seller) throw fail("Vendedor no encontrado", 404);
  // Cambiar el % no toca lo vendido: cada venta guardó el suyo (sales.seller_pct).
  return seller.update(datos);
}

// Vendedor de una venta: de esta empresa (el filtro por empresa del modelo) y activo. Devuelve
// lo que se guarda en la venta, con el % de hoy copiado. Una venta sin conexión ya ocurrió: si
// el vendedor se desactivó mientras tanto, se registra igual con él (`offline`).
async function sellerForSale(sellerId, transaction, { offline = false } = {}) {
  if (!sellerId) return { seller_id: null, seller_pct: null };
  const seller = await Seller.findByPk(parseInt(sellerId), { transaction, attributes: ["id", "active", "commission_pct", "name"] });
  if (!seller) {
    if (offline) return { seller_id: null, seller_pct: null };
    throw fail("El vendedor no existe en esta empresa");
  }
  if (!seller.active && !offline) throw fail(`${seller.name} está inactivo: elige otro vendedor`);
  return { seller_id: seller.id, seller_pct: parseFloat(seller.commission_pct) };
}

// ── Reporte del período ──────────────────────────────────────────────────────

// Por vendedor: lo que vendió en el período (facturado menos devoluciones, como Ventas), lo que
// se le cobró, la comisión que ganó en él, y su saldo de hoy (ganado de siempre − liquidado).
async function report({ company_id, date_from, date_to, warehouse_id, wh }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const wid = parseInt(warehouse_id) || null;
  const filtro = wid ? `AND s.warehouse_id = ${wid}` : wh("s");
  const rep = { cid: company_id };

  const [sellers, filas, ventas, pagos] = await Promise.all([
    listSellers({ all: true }),
    q(`WITH ${eventos(filtro)}
       SELECT seller_id,
              COALESCE(SUM(base) FILTER (WHERE TRUE ${dateClauseOn(df, dt, "at")}), 0)::float AS cobrado,
              COALESCE(SUM(commission) FILTER (WHERE TRUE ${dateClauseOn(df, dt, "at")}), 0)::float AS comision,
              COALESCE(SUM(commission) FILTER (WHERE kind = 'devolucion' ${dateClauseOn(df, dt, "at")}), 0)::float AS devuelto,
              COALESCE(SUM(commission), 0)::float AS ganado,
              COALESCE(SUM(pend), 0)::float AS por_cobrar
         FROM ce GROUP BY seller_id`, rep),
    q(`SELECT s.seller_id, COUNT(*)::int AS ventas,
              COALESCE(SUM(s.total - COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id = s.id AND r.status <> 'anulado'), 0)), 0)::float AS vendido
         FROM sales s
        WHERE s.company_id = :cid AND s.seller_id IS NOT NULL AND s.status IN (${DISPATCHED_SQL}) AND s.status <> 'espera'
              ${filtro} ${dateClauseOn(df, dt, "s.created_at")}
        GROUP BY s.seller_id`, rep),
    // Lo liquidado no se corta por sucursal: se le paga a la persona.
    q(`SELECT cp.seller_id, COALESCE(SUM(cp.amount), 0)::float AS pagado, MAX(cp.paid_at) AS ultimo
         FROM commission_payouts cp
        WHERE cp.company_id = :cid AND ${PAGO_VIVO}
        GROUP BY cp.seller_id`, rep),
  ]);

  const por = (rows) => new Map(rows.map(r => [r.seller_id, r]));
  const fm = por(filas), vm = por(ventas), pm = por(pagos);
  const data = sellers.map(s => {
    const f = fm.get(s.id) || {}, v = vm.get(s.id) || {}, p = pm.get(s.id) || {};
    const ganado = f.ganado || 0, pagado = p.pagado || 0;
    return {
      ...s,
      ventas: v.ventas || 0,
      vendido: r2(v.vendido),
      cobrado: r2(f.cobrado),
      comision: r2(f.comision),
      devuelto: r2(f.devuelto),
      por_cobrar: r2(f.por_cobrar),
      ganado: r2(ganado),
      pagado: r2(pagado),
      saldo: r2(ganado - pagado),
      ultimo_pago: p.ultimo || null,
    };
  })
    // Un inactivo sin nada que mostrar ni que pagar no estorba en la lista.
    .filter(s => s.active || s.ventas || Math.abs(s.saldo) >= 0.005 || s.comision);

  const sum = (k) => r2(data.reduce((a, s) => a + (s[k] || 0), 0));
  return {
    data,
    totals: { vendido: sum("vendido"), cobrado: sum("cobrado"), comision: sum("comision"), por_cobrar: sum("por_cobrar"), saldo: sum("saldo") },
  };
}

// ── Estado de cuenta de un vendedor ──────────────────────────────────────────

// Saldo al empezar el período, cada cobro y devolución que movió su comisión, cada
// liquidación, y el saldo al cerrar. Es lo que se imprime y se le entrega.
async function statement(sellerId, { company_id, date_from, date_to }) {
  const seller = await Seller.findByPk(sellerId);
  if (!seller) throw fail("Vendedor no encontrado", 404);
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const rep = { cid: company_id, sid: seller.id };
  const dia = localDate("e.at");

  const [movs, previo, pagos, pendientes] = await Promise.all([
    q(`WITH ${eventos("AND s.seller_id = :sid")}
       SELECT e.sale_id, e.kind, e.at, ${dia} AS day, e.base::float AS base, e.commission::float AS commission,
              s.invoice_number, s.total::float AS sale_total, s.seller_pct::float AS pct, c.name AS customer_name
         FROM ce e
         JOIN sales s ON s.id = e.sale_id
         LEFT JOIN customers c ON c.id = s.customer_id
        WHERE ABS(e.commission) >= 0.000005 ${dateClauseOn(df, dt, "e.at")}
        ORDER BY e.at, e.sale_id, e.ord`, rep),
    df
      ? q(`WITH ${eventos("AND s.seller_id = :sid")}
           SELECT COALESCE((SELECT SUM(commission) FROM ce WHERE ${localDate("at")} < '${df}'::date), 0)::float AS ganado,
                  COALESCE((SELECT SUM(cp.amount) FROM commission_payouts cp
                             WHERE cp.seller_id = :sid AND cp.paid_at < '${df}'::date AND ${PAGO_VIVO}), 0)::float AS pagado`, rep)
      : Promise.resolve([{ ganado: 0, pagado: 0 }]),
    q(`SELECT cp.id, cp.amount::float AS amount, cp.paid_at, cp.notes, cp.expense_id,
              e.amount::float AS expense_amount, COALESCE(e.rate, 1)::float AS rate, e.reference,
              j.name AS journal_name, cu.symbol AS currency_symbol, em.full_name AS employee_name,
              (e.id IS NOT NULL AND e.status <> 'anulado') AS vivo
         FROM commission_payouts cp
         LEFT JOIN expenses e ON e.id = cp.expense_id
         LEFT JOIN payment_journals j ON j.id = e.payment_journal_id
         LEFT JOIN currencies cu ON cu.id = e.currency_id
         LEFT JOIN employees em ON em.id = cp.employee_id
        WHERE cp.seller_id = :sid
              ${df ? `AND cp.paid_at >= '${df}'::date` : ""} ${dt ? `AND cp.paid_at <= '${dt}'::date` : ""}
        ORDER BY cp.paid_at, cp.id`, rep),
    // Comisión que todavía está en la calle: facturas suyas con saldo por cobrar.
    q(`WITH ${eventos("AND s.seller_id = :sid")}
       SELECT e.sale_id, e.pend::float AS pend, s.invoice_number, s.created_at, c.name AS customer_name
         FROM ce e
         JOIN sales s ON s.id = e.sale_id
         LEFT JOIN customers c ON c.id = s.customer_id
        WHERE e.pend >= 0.005
        ORDER BY s.created_at`, rep),
  ]);

  const apertura = (previo[0]?.ganado || 0) - (previo[0]?.pagado || 0);
  const ganado = movs.reduce((a, m) => a + m.commission, 0);
  const pagado = pagos.filter(p => p.vivo).reduce((a, p) => a + p.amount, 0);
  return {
    seller: { ...seller.toJSON(), commission_pct: parseFloat(seller.commission_pct) },
    opening: r2(apertura),
    earned: r2(ganado),
    returned: r2(movs.filter(m => m.kind === "devolucion").reduce((a, m) => a + m.commission, 0)),
    paid: r2(pagado),
    closing: r2(apertura + ganado - pagado),
    movements: movs.map(m => ({ ...m, base: r5(m.base), commission: r5(m.commission) })),
    payouts: pagos,
    pending: pendientes.map(p => ({ ...p, pend: r2(p.pend) })),
    pending_total: r2(pendientes.reduce((a, p) => a + p.pend, 0)),
  };
}

// Saldo de hoy de un vendedor: lo que se le puede liquidar.
async function balanceOf(sellerId, company_id, transaction) {
  const [row] = await sequelize.query(
    `WITH ${eventos("AND s.seller_id = :sid")}
     SELECT COALESCE((SELECT SUM(commission) FROM ce), 0)::float AS ganado,
            COALESCE((SELECT SUM(cp.amount) FROM commission_payouts cp WHERE cp.seller_id = :sid AND ${PAGO_VIVO}), 0)::float AS pagado`,
    { replacements: { cid: company_id, sid: sellerId }, type: Sequelize.QueryTypes.SELECT, transaction },
  );
  return r2((row?.ganado || 0) - (row?.pagado || 0));
}

// ── Liquidar ─────────────────────────────────────────────────────────────────

// Paga comisiones a un vendedor: un egreso (categoría "Comisiones a vendedores", de la caja o
// banco elegidos) y la liquidación que lo apunta. `amount` va en moneda base; el egreso guarda
// además la moneda y la tasa del pago, como un pago a proveedor.
async function createPayout(sellerId, body, req) {
  const company_id = req.company_id;
  const amount = r5(body.amount);
  if (!(amount > 0)) throw fail("El monto debe ser mayor a 0");
  if (!body.payment_journal_id) throw fail("Elige de qué caja o banco sale el pago");
  const warehouse_id = parseInt(body.warehouse_id);
  if (!warehouse_id) throw fail("Falta la sucursal del egreso");
  await assertWarehouseAccess(req, warehouse_id);
  const almacen = await Warehouse.findByPk(warehouse_id, { attributes: ["id", "name", "sells"] });
  if (almacen && almacen.sells === false) throw fail(`${almacen.name} es un depósito: los movimientos se registran en un punto de venta`);

  const seller = await Seller.findByPk(sellerId);
  if (!seller) throw fail("Vendedor no encontrado", 404);

  return sequelize.transaction(async (transaction) => {
    await assertJournalsInWarehouse(body.payment_journal_id, warehouse_id, transaction);
    // Dos liquidaciones a la vez del mismo vendedor pagarían dos veces el mismo saldo.
    await sequelize.query("SELECT id FROM sellers WHERE id = :id FOR UPDATE", { replacements: { id: seller.id }, transaction });
    const saldo = await balanceOf(seller.id, company_id, transaction);
    if (amount > saldo + 0.01) throw fail(`Pasa de lo que se le debe (Ref. ${saldo.toFixed(2)})`);

    const [cat] = await ExpenseCategory.findOrCreate({
      where: { name: "Comisiones a vendedores", company_id },
      defaults: { name: "Comisiones a vendedores", active: true, company_id },
      transaction,
    });
    const paidAt = sanitizeDate(body.date) || null;
    const notas = String(body.notes ?? "").trim().slice(0, 300) || null;
    const metodo = await resolveMethod(body.payment_journal_id, body.payment_method, "out");
    const expense = await Expense.create({
      description: `Comisiones — ${seller.name} (${seller.code})`,
      amount,
      currency_id: body.currency_id || null,
      rate: parseFloat(body.exchange_rate) || 1,
      category_id: cat.id,
      payment_journal_id: body.payment_journal_id,
      payment_method: metodo,
      reference: String(body.reference ?? "").trim().slice(0, 50) || null,
      notes: notas,
      employee_id: req.employee.id,
      company_id,
      warehouse_id,
      status: "activo",
      date: toLocalDate(paidAt),
    }, { transaction });

    const payout = await CommissionPayout.create({
      company_id,
      seller_id: seller.id,
      amount,
      expense_id: expense.id,
      paid_at: paidAt || localHoy(),
      notes: notas,
      employee_id: req.employee.id,
    }, { transaction });
    return { payout, expense_id: expense.id, balance: r2(saldo - amount) };
  });
}

// Deshacer una liquidación es anular su egreso, igual que desde Contabilidad: el dinero vuelve a
// la caja y la comisión vuelve a deberse.
async function voidPayout(payoutId, req) {
  const payout = await CommissionPayout.findByPk(payoutId);
  if (!payout) throw fail("Liquidación no encontrada", 404);
  const expense = payout.expense_id ? await Expense.findByPk(payout.expense_id) : null;
  if (!expense || expense.status === "anulado") throw fail("Esa liquidación ya está anulada");
  await assertWarehouseAccess(req, expense.warehouse_id, { optional: true });
  await expense.update({ status: "anulado" });
  return { ok: true };
}

// Hoy en la zona de la operación, como YYYY-MM-DD.
function localHoy() {
  const { TZ } = require("../reports/shared");
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

module.exports = { listSellers, saveSeller, sellerForSale, report, statement, createPayout, voidPayout };
