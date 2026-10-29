'use strict';

/**
 * Pagos que el cliente reporta desde el catálogo ("pagué por pago móvil, ref. 123456").
 *
 * Un reporte no es dinero en ninguna caja: es lo que el cliente DICE que pagó. Por eso nace
 * 'pendiente' y nadie lo cobra hasta confirmarlo. Se confirma solo cuando el pago ya está en un
 * extracto subido a Conciliación (misma cuenta, mismo monto y la referencia casa) — el caso del
 * cliente que reporta un pago de hace días—, o cuando alguien con `accounting.confirm` lo revisa
 * en su banco. Un extracto que llega después confirma los pendientes de esa cuenta.
 *
 * Confirmado, queda pegado al pedido. La caja lo registra al cobrar (`aplicar`): sale por el
 * mismo createPayment de siempre, con la referencia, la cuenta y el método del reporte, así que
 * el arqueo, el ticket y los reportes no distinguen este cobro de uno hecho en el mostrador. Si el
 * extracto lo había casado, el cobro nace conciliado contra esa línea.
 *
 * La referencia vieja que ya está conciliada con otro cobro se rechaza al reportar: es el
 * intento de pagar dos pedidos con la misma transferencia.
 */

const {
  sequelize, Sequelize, PaymentReport, Sale, BankStatementLine, BankReconciliationMatch,
} = require("../models");
const { refDigits, lineRefs } = require("./bankReconciliation/shared");
const { TZ } = require("./reports/shared");
const { getSaleBalance } = require("./payments/shared");
const { liveReturnedTotal } = require("./returns/shared");
const { tasaDivisasDeCaja } = require("./sales/fxRate");
const { imageUrl } = require("../utils/imageStorage");
const { visibleWarehouseIds } = require("../middleware/auth");

const QT = Sequelize.QueryTypes;
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const TOL = 0.01;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const dayNum = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const shiftDay = (iso, n) => new Date((dayNum(iso) + n) * 86400000).toISOString().slice(0, 10);

// Ventas a las que el cliente todavía le puede reportar un pago.
const POR_PAGAR = ["pedido", "espera", "borrador", "pendiente", "parcial"];
// Reportes que cuentan como dinero en camino: restan de lo que falta por pagar.
const VIVOS = ["pendiente", "confirmado"];

// ── Opciones de pago publicadas ──────────────────────────────────────────

// Datos que la empresa publica para cada método. Solo texto corto: va a una página abierta.
const INFO_LIMITS = { titular: 80, documento: 20, telefono: 30, cuenta: 40, correo: 120, instrucciones: 300 };
function limpiarInfo(raw) {
  const out = {};
  for (const [k, max] of Object.entries(INFO_LIMITS)) {
    const v = String(raw?.[k] ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    if (v) out[k] = v;
  }
  return out;
}

// La opción se nombra por cuenta y método, no por el id de la fila: el formulario de Diarios
// reescribe los métodos al guardar y el id cambiaría con la página del cliente abierta.
const optionKey = (journalId, code) => `${journalId}:${code}`;

/**
 * Cuentas × métodos que la empresa publica en el catálogo, con la moneda en que se paga cada
 * una. Con sucursal, solo las cuentas que sirven a esa sucursal (o las compartidas).
 */
async function opcionesDePago(companyId, warehouseId = null, transaction) {
  const rows = await sequelize.query(`
    SELECT m.journal_id, m.method_code, m.catalog_info,
           pj.name AS journal_name,
           b.name AS bank_name, b.image_filename AS bank_image,
           pm.name AS method_name, pm.image_filename AS method_image,
           COALESCE(c.id, cb.id) AS currency_id,
           COALESCE(c.code, cb.code) AS currency_code,
           COALESCE(c.symbol, cb.symbol) AS currency_symbol,
           COALESCE(c.exchange_rate, cb.exchange_rate, 1) AS rate,
           COALESCE(c.is_base, TRUE) AS is_base
      FROM payment_journal_methods m
      JOIN payment_journals pj ON pj.id = m.journal_id AND pj.active AND pj.merged_into_id IS NULL
      -- Sin el extra de pedidos web la empresa no cobra en línea, aunque haya métodos marcados.
      JOIN companies co ON co.id = pj.company_id AND co.pedidos_web_enabled AND co.catalog_enabled
      LEFT JOIN banks b ON b.id = pj.bank_id
      LEFT JOIN payment_methods pm ON pm.code = m.method_code AND pm.company_id = pj.company_id
      LEFT JOIN currencies c ON c.id = pj.currency_id
      LEFT JOIN LATERAL (SELECT id, code, symbol, exchange_rate FROM currencies
                          WHERE company_id = pj.company_id AND is_base LIMIT 1) cb ON TRUE
     WHERE pj.company_id = :cid AND m.catalog_visible AND m.allows_inflow
       AND (CAST(:wid AS INTEGER) IS NULL
            OR NOT EXISTS (SELECT 1 FROM payment_journal_warehouses w WHERE w.journal_id = pj.id)
            OR EXISTS (SELECT 1 FROM payment_journal_warehouses w WHERE w.journal_id = pj.id AND w.warehouse_id = :wid))
     ORDER BY pj.sort_order, pj.id, m.sort_order
  `, { replacements: { cid: companyId, wid: warehouseId || null }, type: QT.SELECT, transaction });

  return rows.map(r => ({
    id: optionKey(r.journal_id, r.method_code),
    journal_id: r.journal_id,
    method: r.method_code,
    method_name: r.method_name || r.method_code,
    method_logo: imageUrl(r.method_image),
    bank_name: r.bank_name || r.journal_name,
    bank_logo: imageUrl(r.bank_image),
    currency_id: r.currency_id,
    currency: { code: r.currency_code, symbol: r.currency_symbol || "Ref.", rate: parseFloat(r.rate) || 1, is_base: !!r.is_base },
    info: limpiarInfo(r.catalog_info),
  }));
}

// ── Referencias ──────────────────────────────────────────────────────────

// ¿Es la misma transferencia? Igual, o una es el final de la otra con al menos seis dígitos (el
// cliente escribe los últimos dígitos; el banco trae el número entero). Con cuatro, dos pagos
// distintos coinciden por casualidad demasiado seguido. Las referencias con letras (Zelle) se
// comparan enteras.
function mismaReferencia(a, b) {
  const da = refDigits(a), db = refDigits(b);
  if (da.length >= 4 && db.length >= 4) {
    if (da === db) return true;
    return Math.min(da.length, db.length) >= 6 && (da.endsWith(db) || db.endsWith(da));
  }
  const na = String(a || "").replace(/[^0-9a-z]/gi, "").toLowerCase();
  return !!na && na === String(b || "").replace(/[^0-9a-z]/gi, "").toLowerCase();
}

// Para confirmar solo con el extracto se exige más que para avisar de un duplicado: seis
// dígitos que casen con la referencia (o con un número de la descripción) de la línea.
function casaConLinea(line, ref) {
  const d = refDigits(ref);
  if (d.length < 6) return false;
  return lineRefs(line).some(r => r.length >= 6 && (r.endsWith(d) || d.endsWith(r)));
}

/**
 * Línea del extracto de esa cuenta que es este pago: abono por el mismo monto (al céntimo),
 * fechado entre tres días antes y cinco después de lo que dijo el cliente, y con la referencia.
 * Las líneas que ya explican otro reporte no cuentan. Devuelve { line, usada } o null; `usada`
 * = la línea ya está conciliada con un movimiento del sistema.
 */
async function buscarEnExtracto({ companyId, journalId, amount, ref, date, excludeId = null }, transaction) {
  const lines = await sequelize.query(`
    SELECT l.id, l.status, l.reference, l.description, l.date, l.credit
      FROM bank_statement_lines l
      JOIN bank_statements st ON st.id = l.statement_id
     WHERE st.company_id = :cid AND st.journal_id = :jid
       AND l.credit > 0 AND ABS(l.credit - :amount) <= :tol
       AND l.date BETWEEN :from AND :to
       AND NOT EXISTS (SELECT 1 FROM payment_reports r
                        WHERE r.statement_line_id = l.id AND r.status <> 'rechazado'
                          AND r.id IS DISTINCT FROM CAST(:rid AS INTEGER))
     ORDER BY l.date, l.id
  `, {
    replacements: { cid: companyId, jid: journalId, amount, tol: TOL, from: shiftDay(date, -3), to: shiftDay(date, 5), rid: excludeId },
    type: QT.SELECT, transaction,
  });
  const hits = lines.filter(l => casaConLinea(l, ref));
  const libre = hits.find(l => l.status !== "conciliado");
  if (libre) return { line: libre, usada: false };
  return hits.length ? { line: hits[0], usada: true } : null;
}

// ¿Esa referencia ya se reportó (y no se rechazó) o ya entró como cobro en esa cuenta? Se mira
// por los últimos seis dígitos en SQL y se confirma en JS con la misma regla.
async function referenciaUsada({ journalId, ref, excludeId = null }, transaction) {
  const d = refDigits(ref);
  const tail = d.length >= 4 ? d.slice(-6) : null;
  const like = tail ? `%${tail}` : String(ref || "").trim();
  const [reportes, cobros] = await Promise.all([
    sequelize.query(`
      SELECT id, reference_number FROM payment_reports
       WHERE journal_id = :jid AND status <> 'rechazado' AND id IS DISTINCT FROM CAST(:rid AS INTEGER)
         AND ${tail ? `regexp_replace(reference_number, '\\D', '', 'g') LIKE :like` : `reference_number ILIKE :like`}
    `, { replacements: { jid: journalId, rid: excludeId, like }, type: QT.SELECT, transaction }),
    sequelize.query(`
      SELECT id, reference_number FROM payments
       WHERE payment_journal_id = :jid AND amount > 0 AND reference_number IS NOT NULL
         AND created_at > NOW() - INTERVAL '180 days'
         AND ${tail ? `regexp_replace(reference_number, '\\D', '', 'g') LIKE :like` : `reference_number ILIKE :like`}
    `, { replacements: { jid: journalId, like }, type: QT.SELECT, transaction }),
  ]);
  if (reportes.some(r => mismaReferencia(r.reference_number, ref))) return "reporte";
  if (cobros.some(p => mismaReferencia(p.reference_number, ref))) return "cobro";
  return null;
}

// ── Saldo del pedido ─────────────────────────────────────────────────────

// Lo que el cliente todavía debe en moneda base: total menos lo cobrado, lo devuelto y lo que
// ya reportó (pendiente o confirmado, todavía sin aplicar).
async function faltaPorPagar(sale, transaction) {
  const pagado = await getSaleBalance(sale.id, transaction);
  const devuelto = await liveReturnedTotal(sale.id, transaction);
  const [{ reportado }] = await sequelize.query(`
    SELECT COALESCE(SUM(amount_base), 0) AS reportado FROM payment_reports
     WHERE sale_id = :sid AND status IN (:vivos)
  `, { replacements: { sid: sale.id, vivos: VIVOS }, type: QT.SELECT, transaction });
  return Math.max(0, parseFloat(sale.total) - devuelto - pagado - parseFloat(reportado));
}

// ── Reportar (desde el catálogo) ─────────────────────────────────────────

/**
 * Registra el pago que reporta el cliente para una venta suya. Corre dentro del contexto de la
 * empresa (rutas públicas) y de la transacción de quien llama: al pedir, es la misma que crea
 * la venta. Devuelve el reporte.
 */
async function reportar({ companyId, sale, body }, transaction) {
  if (!POR_PAGAR.includes(sale.status)) throw fail("Este pedido ya no tiene pagos por reportar.");

  const opciones = await opcionesDePago(companyId, sale.warehouse_id || sale.requested_warehouse_id || null, transaction);
  const op = opciones.find(o => o.id === String(body.option_id || ""));
  if (!op) throw fail("Ese método de pago ya no está disponible. Recarga la página.");

  const amount = r2(String(body.amount ?? "").replace(",", "."));
  if (!(amount > 0)) throw fail("Indica el monto que pagaste.");

  const ref = String(body.reference_number || "").trim().slice(0, 100);
  if (ref.replace(/[^0-9a-z]/gi, "").length < 4) throw fail("Escribe el número de referencia del pago.");

  const date = String(body.reference_date || "").slice(0, 10);
  if (!ISO_DAY.test(date) || isNaN(Date.parse(date))) throw fail("Indica la fecha del pago.");
  if (date > shiftDay(hoy(), 1)) throw fail("La fecha del pago no puede ser futura.");
  if (date < shiftDay(hoy(), -60)) throw fail("Ese pago tiene más de 60 días. Comunícate con la tienda.");

  const rate = op.currency.is_base ? 1 : op.currency.rate;
  const base = parseFloat((amount / rate).toFixed(6));

  // Primero si la referencia ya se usó: es lo que más importa decir, y el monto de un pago
  // ajeno casi nunca cuadra con este pedido.
  const usada = await referenciaUsada({ journalId: op.journal_id, ref }, transaction);
  if (usada === "reporte") throw fail("Ese pago ya fue reportado. Si es otro pago, revisa la referencia.", 409);
  if (usada === "cobro") throw fail("Ese pago ya está registrado en la tienda. Si es otro pago, revisa la referencia.", 409);

  const hit = await buscarEnExtracto({ companyId, journalId: op.journal_id, amount, ref, date }, transaction);
  if (hit?.usada) throw fail("Ese pago ya está registrado en la tienda. Si es otro pago, revisa la referencia.", 409);

  // Un monto muy por encima de lo que falta es un error de tecleo (un cero de más) o una
  // moneda equivocada: mejor decirlo ahora que dejar a la tienda con un sobrante que devolver.
  const falta = await faltaPorPagar(sale, transaction);
  if (falta <= TOL) throw fail("Este pedido ya no tiene saldo por pagar.");
  if (base > falta * 1.10 + 1) {
    const enMoneda = r2(falta * rate);
    throw fail(`El monto supera lo que falta por pagar (${op.currency.symbol} ${enMoneda.toFixed(2)}).`);
  }

  return PaymentReport.create({
    company_id: companyId,
    sale_id: sale.id,
    customer_id: sale.customer_id || null,
    journal_id: op.journal_id,
    payment_method: op.method,
    currency_id: op.currency_id || null,
    amount,
    exchange_rate: rate,
    amount_base: base,
    reference_number: ref,
    reference_date: date,
    payer_bank: String(body.payer_bank || "").trim().slice(0, 80) || null,
    payer_phone: String(body.payer_phone || "").trim().slice(0, 30) || null,
    status: hit ? "confirmado" : "pendiente",
    confirmed_via: hit ? "extracto" : null,
    statement_line_id: hit ? hit.line.id : null,
    reviewed_at: hit ? new Date() : null,
  }, { transaction });
}

// Lo que el cliente ve de sus reportes en "Mis pedidos". Sin la línea del banco ni quién lo
// revisó: eso es de la tienda.
async function paraCliente(saleIds) {
  if (!saleIds.length) return new Map();
  const rows = await sequelize.query(`
    SELECT r.id, r.sale_id, r.status, r.amount, r.reference_number, r.reference_date, r.reject_reason, r.created_at,
           COALESCE(pm.name, r.payment_method) AS method_name, b.name AS bank_name,
           COALESCE(c.symbol, 'Ref.') AS currency_symbol
      FROM payment_reports r
      JOIN payment_journals pj ON pj.id = r.journal_id
      LEFT JOIN banks b ON b.id = pj.bank_id
      LEFT JOIN payment_methods pm ON pm.code = r.payment_method AND pm.company_id = r.company_id
      LEFT JOIN currencies c ON c.id = r.currency_id
     WHERE r.sale_id IN (:ids)
     ORDER BY r.created_at
  `, { replacements: { ids: saleIds }, type: QT.SELECT });
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.sale_id)) out.set(r.sale_id, []);
    out.get(r.sale_id).push({
      id: r.id,
      // Aplicado es, para el cliente, lo mismo que confirmado: la tienda recibió su dinero.
      status: r.status === "aplicado" ? "confirmado" : r.status,
      amount: parseFloat(r.amount),
      currency_symbol: r.currency_symbol,
      method_name: r.method_name,
      bank_name: r.bank_name,
      reference: r.reference_number,
      date: r.reference_date,
      reject_reason: r.status === "rechazado" ? (r.reject_reason || null) : null,
    });
  }
  return out;
}

// ── Extracto nuevo ───────────────────────────────────────────────────────

// Tras subir un extracto: los reportes pendientes de esa cuenta que ahora aparecen en el banco
// quedan confirmados. Devuelve cuántos. Uno que cae en una línea ya conciliada no se toca: lo
// revisa una persona (puede ser el cobro que la caja registró a mano por ese mismo pago).
async function casarPendientes(companyId, journalId) {
  const pendientes = await sequelize.query(`
    SELECT id, amount, reference_number, reference_date FROM payment_reports
     WHERE company_id = :cid AND journal_id = :jid AND status = 'pendiente'
  `, { replacements: { cid: companyId, jid: journalId }, type: QT.SELECT });
  let n = 0;
  for (const r of pendientes) {
    const hit = await buscarEnExtracto({
      companyId, journalId, amount: parseFloat(r.amount), ref: r.reference_number,
      date: String(r.reference_date).slice(0, 10), excludeId: r.id,
    });
    if (!hit || hit.usada) continue;
    try {
      const [count] = await PaymentReport.update(
        { status: "confirmado", confirmed_via: "extracto", statement_line_id: hit.line.id, reviewed_at: new Date() },
        { where: { id: r.id, status: "pendiente" } },
      );
      n += count;
    } catch (e) {
      // Otro reporte tomó esa línea en el mismo instante (índice único): este sigue pendiente.
      if (e?.name !== "SequelizeUniqueConstraintError") throw e;
    }
  }
  return n;
}

// La línea del extracto es un pago reportado que la caja todavía no registró: casarla con otra
// cosa, o registrarla como ingreso suelto, contaría ese dinero dos veces.
async function lineaReservada(lineId, transaction) {
  const [r] = await sequelize.query(`
    SELECT r.id, r.sale_id, s.invoice_number FROM payment_reports r
      LEFT JOIN sales s ON s.id = r.sale_id
     WHERE r.statement_line_id = :lid AND r.status = 'confirmado' LIMIT 1
  `, { replacements: { lid: lineId }, type: QT.SELECT, transaction });
  return r || null;
}

// ── Revisión (personal de la tienda) ─────────────────────────────────────

const companyOf = (req) => {
  const c = req.employee?.company_id ?? null;
  if (!c) throw fail("Elige una empresa");
  return parseInt(c, 10);
};

async function list(req, query = {}) {
  const companyId = companyOf(req);
  const where = ["r.company_id = :cid"];
  const rep = { cid: companyId };
  const estados = String(query.status || "").split(",").map(s => s.trim()).filter(Boolean);
  if (estados.length) { where.push("r.status IN (:estados)"); rep.estados = estados; }
  if (query.sale_id) { where.push("r.sale_id = :sid"); rep.sid = parseInt(query.sale_id, 10) || 0; }
  const allowed = await visibleWarehouseIds(req);
  if (allowed !== null) {
    where.push(`(s.id IS NULL OR COALESCE(s.warehouse_id, s.requested_warehouse_id) IS NULL
                 OR COALESCE(s.warehouse_id, s.requested_warehouse_id) IN (:allowed))`);
    rep.allowed = allowed.length ? allowed : [-1];
  }
  const rows = await sequelize.query(`
    SELECT r.id, r.sale_id, r.status, r.amount, r.amount_base, r.exchange_rate, r.reference_number,
           r.reference_date, r.payer_bank, r.payer_phone, r.confirmed_via, r.statement_line_id,
           r.payment_id, r.reviewed_at, r.reject_reason, r.created_at, r.journal_id, r.payment_method,
           s.status AS sale_status, s.invoice_number, s.total AS sale_total,
           COALESCE(cu.name, s.web_customer_name) AS customer_name, cu.rif AS customer_rif,
           pj.name AS journal_name, b.name AS bank_name, COALESCE(pm.name, r.payment_method) AS method_name,
           COALESCE(c.symbol, 'Ref.') AS currency_symbol, c.is_base AS currency_is_base,
           l.date AS line_date, l.description AS line_description,
           e.full_name AS reviewer_name
      FROM payment_reports r
      LEFT JOIN sales s ON s.id = r.sale_id
      LEFT JOIN customers cu ON cu.id = COALESCE(s.customer_id, r.customer_id)
      JOIN payment_journals pj ON pj.id = r.journal_id
      LEFT JOIN banks b ON b.id = pj.bank_id
      LEFT JOIN payment_methods pm ON pm.code = r.payment_method AND pm.company_id = r.company_id
      LEFT JOIN currencies c ON c.id = r.currency_id
      LEFT JOIN bank_statement_lines l ON l.id = r.statement_line_id
      LEFT JOIN employees e ON e.id = r.reviewed_by
     WHERE ${where.join(" AND ")}
     ORDER BY (r.status = 'pendiente') DESC, r.created_at DESC
     LIMIT 300
  `, { replacements: rep, type: QT.SELECT });
  return {
    data: rows.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
      amount_base: parseFloat(r.amount_base),
      exchange_rate: parseFloat(r.exchange_rate),
      sale_total: r.sale_total != null ? parseFloat(r.sale_total) : null,
    })),
  };
}

async function cargar(req, id, transaction) {
  const rep = await PaymentReport.findOne({
    where: { id: parseInt(id, 10) || 0, company_id: companyOf(req) }, transaction, lock: transaction ? true : undefined,
  });
  if (!rep) throw fail("Pago reportado no encontrado", 404);
  return rep;
}

// Confirmar a mano: alguien vio el dinero en el banco. Si un extracto ya lo trae, se ata a esa
// línea para que el cobro nazca conciliado.
async function confirm(req, id) {
  return sequelize.transaction(async (t) => {
    const rep = await cargar(req, id, t);
    if (rep.status !== "pendiente") throw fail("Este pago ya fue revisado");
    const hit = await buscarEnExtracto({
      companyId: rep.company_id, journalId: rep.journal_id, amount: parseFloat(rep.amount),
      ref: rep.reference_number, date: String(rep.reference_date).slice(0, 10), excludeId: rep.id,
    }, t);
    await rep.update({
      status: "confirmado",
      confirmed_via: hit && !hit.usada ? "extracto" : "manual",
      statement_line_id: hit && !hit.usada ? hit.line.id : null,
      reviewed_by: req.employee.id,
      reviewed_at: new Date(),
    }, { transaction: t });
    return { data: rep };
  });
}

async function reject(req, id, body = {}) {
  return sequelize.transaction(async (t) => {
    const rep = await cargar(req, id, t);
    if (rep.status === "aplicado") throw fail("Este pago ya se registró como cobro. Para quitarlo, elimina el cobro.");
    if (rep.status === "rechazado") throw fail("Este pago ya estaba rechazado");
    const reason = String(body.reason || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (reason.length < 3) throw fail("Indica el motivo: el cliente lo verá en su pedido");
    await rep.update({
      status: "rechazado", reject_reason: reason, statement_line_id: null,
      reviewed_by: req.employee.id, reviewed_at: new Date(),
    }, { transaction: t });
    return { data: rep };
  });
}

/**
 * Registra un pago confirmado como cobro de su factura. Usa createPayment tal cual, con una clave
 * de idempotencia por reporte: si la red se corta después del cobro, el reintento recibe el
 * mismo cobro y solo termina de marcar el reporte.
 *
 * La tasa es la del día en que el cliente reportó (la que vio en el catálogo), o la de divisas
 * de la factura si la tiene: con la de hoy, un pago móvil exacto dejaría un saldo de céntimos.
 * Lo que pase de lo adeudado va al saldo a favor del cliente, como el "sobrante a crédito" de
 * la caja.
 */
async function aplicar(req, id) {
  const createPayment = require("./payments/createPayment");
  const rep = await cargar(req, id);
  if (rep.status === "aplicado") throw fail("Este pago ya se registró");
  if (rep.status !== "confirmado") throw fail("Confirma el pago antes de registrarlo");
  if (!rep.sale_id) throw fail("El pedido de este pago ya no existe");

  const sale = await Sale.findByPk(rep.sale_id);
  if (!sale) throw fail("El pedido de este pago ya no existe");
  if (sale.status === "pedido") throw fail("Acepta el pedido antes de registrar su pago");
  if (sale.status === "espera") throw fail("Cobra la cuenta desde la caja para registrar este pago");
  if (!["borrador", "pendiente", "parcial"].includes(sale.status)) throw fail("Esta factura ya no está por cobrar");

  const tasaFx = await tasaDivisasDeCaja(sale, rep.journal_id);
  const rate = tasaFx || parseFloat(rep.exchange_rate) || 1;
  const amountCur = parseFloat(rep.amount);
  const base = parseFloat((amountCur / rate).toFixed(6));

  const pagado = await getSaleBalance(sale.id);
  const devuelto = await liveReturnedTotal(sale.id);
  const pendiente = Math.max(0, parseFloat(sale.total) - devuelto - pagado);
  // El sobrante se mide en la moneda del pago, con el margen de redondeo de la caja.
  const sobranteCur = r2(amountCur - r2(pendiente * rate));
  const aCredito = sobranteCur > (rate > 1 ? 0.05 : TOL) ? parseFloat((sobranteCur / rate).toFixed(6)) : 0;

  const res = await createPayment({
    sale_id: sale.id,
    amount: base,
    currency_id: rep.currency_id || null,
    exchange_rate: rate,
    payment_journal_id: rep.journal_id,
    payment_method: rep.payment_method,
    employee_id: req.employee.id,
    reference_date: String(rep.reference_date).slice(0, 10),
    reference_number: rep.reference_number,
    notes: `Pago reportado desde el catálogo${rep.payer_bank ? ` · desde ${rep.payer_bank}` : ""}`,
    change_to_credit: aCredito > 0 ? aCredito : undefined,
    idempotency_key: `reporte_${rep.id}`,
  }, req);

  const paymentId = res?.payment?.id || null;
  await sequelize.transaction(async (t) => {
    await PaymentReport.update({ status: "aplicado", payment_id: paymentId }, { where: { id: rep.id }, transaction: t });
    if (!rep.statement_line_id || !paymentId) return;
    const line = await BankStatementLine.findByPk(rep.statement_line_id, { transaction: t, lock: true });
    if (!line || line.status === "conciliado") return;
    await BankReconciliationMatch.create({
      company_id: rep.company_id, line_id: line.id, source_type: "payment", source_id: paymentId,
      role: "documento", amount: amountCur,
    }, { transaction: t });
    await line.update({
      status: "conciliado", match_mode: "reporte", difference: 0,
      resolved_by: req.employee.id, resolved_at: new Date(),
    }, { transaction: t });
  });
  return res;
}

module.exports = {
  opcionesDePago, reportar, paraCliente, faltaPorPagar, casarPendientes, lineaReservada,
  list, confirm, reject, aplicar, limpiarInfo, optionKey, POR_PAGAR,
};
