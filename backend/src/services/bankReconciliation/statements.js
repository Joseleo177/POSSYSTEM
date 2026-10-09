'use strict';

const {
  sequelize, QT, localDate, fail, r2, companyOf, ISO_DAY,
  Bank, BankStatement, BankStatementLine, BankReconciliationMatch,
} = require("./shared");
const { statementJournals, journalRows, assertAccountAccess, defaultJournal } = require("./accounts");
const { loadUnits, autoMatch, windowFor } = require("./candidates");
const { voidCreatedDocs } = require("./documents");
const { visibleWarehouseIds, assertWarehouseAccess } = require("../../middleware/auth");

const KINDS = ["movimiento", "comision", "impuesto", "interes"];
const MAX_LINES = 5000;

/**
 * Libera las líneas cuyo documento ya no existe o se anuló (un cobro borrado, un egreso
 * anulado desde su pantalla). La línea vuelve a pendiente con TODO lo que tenía casado: era
 * un conjunto que cuadraba, y sin una de sus partes ya no cuadra. Lo que la conciliación había
 * creado para esa línea (la comisión del lote) se anula, para no duplicarlo al volver a casar.
 *
 * Se hace al leer, y no en cada pantalla que borra o anula: así no hay camino que se olvide.
 */
async function pruneStale(companyId) {
  const stale = await sequelize.query(`
    SELECT DISTINCT m.line_id
      FROM bank_reconciliation_matches m
     WHERE m.company_id = :company_id AND (
           (m.source_type = 'payment' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = m.source_id))
        OR (m.source_type = 'income'  AND NOT EXISTS (SELECT 1 FROM incomes  i WHERE i.id = m.source_id AND i.status = 'activo'))
        OR (m.source_type = 'expense' AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.id = m.source_id AND e.status = 'activo'))
     )
  `, { replacements: { company_id: companyId }, type: QT.SELECT });
  if (!stale.length) return 0;
  const ids = stale.map(r => r.line_id);
  await sequelize.transaction(async (t) => {
    await voidCreatedDocs(ids, t);
    await BankReconciliationMatch.destroy({ where: { line_id: ids }, transaction: t });
    await BankStatementLine.update(
      { status: "pendiente", match_mode: null, difference: 0, resolved_by: null, resolved_at: null },
      { where: { id: ids }, transaction: t },
    );
  });
  return ids.length;
}

// Línea tal como llega del navegador (el archivo se lee allá, como la importación de
// productos). Se revalida todo: la vista previa es una cortesía, no un control.
function sanitizeLine(raw, i) {
  const date = String(raw?.date || "").slice(0, 10);
  if (!ISO_DAY.test(date) || isNaN(Date.parse(date))) return null;
  const debit = r2(Math.abs(parseFloat(raw.debit) || 0));
  const credit = r2(Math.abs(parseFloat(raw.credit) || 0));
  if (!(debit > 0) && !(credit > 0)) return null;
  // Una línea es abono o cargo, no las dos cosas.
  const isCredit = credit > 0 && !(debit > 0 && debit >= credit);
  let kind = KINDS.includes(raw.kind) ? raw.kind : "movimiento";
  if (isCredit && (kind === "comision" || kind === "impuesto")) kind = "movimiento";
  if (!isCredit && kind === "interes") kind = "movimiento";
  const bal = raw.balance === null || raw.balance === undefined || raw.balance === "" ? null : r2(raw.balance);
  return {
    line_no: i,
    date,
    description: String(raw.description || "").replace(/\s+/g, " ").trim().slice(0, 500),
    reference: raw.reference ? String(raw.reference).trim().slice(0, 100) || null : null,
    debit: isCredit ? 0 : debit,
    credit: isCredit ? credit : 0,
    balance: Number.isFinite(bal) ? bal : null,
    kind,
  };
}

const dupKey = (l) => [String(l.date).slice(0, 10), l.reference || "", r2(l.debit).toFixed(2), r2(l.credit).toFixed(2), (l.description || "").toUpperCase()].join("|");

// Casa automáticamente las líneas pendientes de un extracto. Devuelve cuántas casó.
async function runAuto(companyId, statement) {
  const journals = await statementJournals(companyId, statement);
  const pending = await BankStatementLine.findAll({
    where: { statement_id: statement.id, status: "pendiente" }, order: [["line_no", "ASC"]], raw: true,
  });
  if (!pending.length || !journals.length) return 0;
  const win = windowFor(pending);
  const units = await loadUnits(companyId, journals.map(j => j.id), win.from, win.to);
  const pairs = autoMatch(pending, units);
  if (!pairs.length) return 0;

  await sequelize.transaction(async (t) => {
    const now = new Date();
    for (const { line, units: us } of pairs) {
      const rows = us.flatMap(u => u.ids.map(id => ({
        company_id: companyId, line_id: line.id, source_type: u.type, source_id: id, role: "documento",
        amount: us.length === 1 && u.ids.length === 1 ? u.amount : 0,
      })));
      await BankReconciliationMatch.bulkCreate(rows, { transaction: t, ignoreDuplicates: true });
      await BankStatementLine.update(
        { status: "conciliado", match_mode: "auto", difference: 0, resolved_at: now },
        { where: { id: line.id, status: "pendiente" }, transaction: t },
      );
    }
  });
  return pairs.length;
}

async function create(req, body) {
  const companyId = companyOf(req);
  // La cuenta es el diario: de él salen banco y moneda.
  const journalId = parseInt(body.journal_id, 10);
  if (!journalId) throw fail("Elige la cuenta del extracto");
  const [cuenta] = await journalRows(companyId, `AND pj.id = :jid`, { jid: journalId });
  if (!cuenta) throw fail("Cuenta no encontrada", 404);
  const bankId = cuenta.bank_id;
  const currencyId = cuenta.currency_id ?? null;
  const warehouseId = body.warehouse_id ? parseInt(body.warehouse_id, 10)
    : (cuenta.warehouse_ids.length === 1 ? cuenta.warehouse_ids[0] : null);
  await assertAccountAccess(req, warehouseId);
  const bank = await Bank.findByPk(bankId);
  if (!bank) throw fail("Banco no encontrado", 404);

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (!rawLines.length) throw fail("El extracto no trae movimientos");
  if (rawLines.length > MAX_LINES) throw fail(`El extracto trae ${rawLines.length} movimientos; el máximo por archivo es ${MAX_LINES}`);

  let lines = rawLines.map(sanitizeLine).filter(Boolean);
  const invalid = rawLines.length - lines.length;
  if (!lines.length) throw fail("Ningún movimiento tiene fecha y monto válidos");
  // Orden cronológico estable: los bancos que listan del más nuevo al más viejo ya se
  // invirtieron al leer, pero un archivo mezclado no debe desordenar el saldo.
  lines = lines.map((l, i) => ({ ...l, _i: i })).sort((a, b) => a.date.localeCompare(b.date) || a._i - b._i);

  // Lo que ya está en otro extracto de la misma cuenta no se repite: subir el extracto del
  // mes después de los del día es lo normal. Se cuentan las repeticiones —dos pagos
  // idénticos el mismo día son dos líneas— y solo se saltan tantas como ya existen.
  const existing = await sequelize.query(`
    SELECT l.date, l.reference, l.debit, l.credit, l.description
      FROM bank_statement_lines l
      JOIN bank_statements st ON st.id = l.statement_id
     WHERE st.company_id = :company_id AND st.journal_id = :journal_id
       AND l.date BETWEEN :from AND :to
  `, {
    replacements: { company_id: companyId, journal_id: journalId, from: lines[0].date, to: lines[lines.length - 1].date },
    type: QT.SELECT,
  });
  const seen = new Map();
  for (const e of existing) { const k = dupKey(e); seen.set(k, (seen.get(k) || 0) + 1); }
  const fresh = [];
  let duplicated = 0;
  for (const l of lines) {
    const k = dupKey(l);
    const n = seen.get(k) || 0;
    if (n > 0) { seen.set(k, n - 1); duplicated++; continue; }
    fresh.push(l);
  }
  if (!fresh.length) throw fail("Todos los movimientos de este archivo ya estaban cargados en otro extracto de la cuenta");

  const first = fresh[0];
  const last = fresh[fresh.length - 1];
  const opening = first.balance !== null ? r2(first.balance - first.credit + first.debit) : null;

  const statement = await sequelize.transaction(async (t) => {
    const st = await BankStatement.create({
      company_id: companyId, journal_id: journalId, bank_id: bankId, currency_id: currencyId, warehouse_id: warehouseId,
      bank_format: body.bank_format ? String(body.bank_format).slice(0, 40) : null,
      filename: body.filename ? String(body.filename).slice(0, 255) : null,
      date_from: first.date, date_to: last.date,
      opening_balance: opening, closing_balance: last.balance,
      employee_id: req.employee.id,
    }, { transaction: t });
    await BankStatementLine.bulkCreate(fresh.map((l, i) => {
      const { _i, ...rest } = l;
      return { ...rest, line_no: i, company_id: companyId, statement_id: st.id };
    }), { transaction: t });
    return st;
  });

  const matched = await runAuto(companyId, statement);
  return {
    data: { id: statement.id },
    stats: { created: fresh.length, duplicated, invalid, matched },
  };
}

async function list(req, query = {}) {
  const companyId = companyOf(req);
  await pruneStale(companyId);
  const allowed = await visibleWarehouseIds(req);
  const rep = { company_id: companyId };
  let where = "";
  if (allowed !== null) where += ` AND st.warehouse_id IN (${allowed.filter(Number.isInteger).join(",") || "NULL"})`;
  if (query.bank_id) { where += " AND st.bank_id = :bank_id"; rep.bank_id = parseInt(query.bank_id, 10); }
  if (query.currency_id) { where += " AND st.currency_id = :currency_id"; rep.currency_id = parseInt(query.currency_id, 10); }
  if (query.journal_id) { where += " AND st.journal_id = :journal_id"; rep.journal_id = parseInt(query.journal_id, 10); }

  const rows = await sequelize.query(`
    SELECT st.id, st.journal_id, st.bank_id, st.currency_id, st.warehouse_id, st.filename, st.bank_format,
           pj.name AS journal_name, pj.account_number,
           st.date_from, st.date_to, st.opening_balance, st.closing_balance, st.created_at,
           b.name AS bank_name, c.symbol AS currency_symbol, c.code AS currency_code,
           w.name AS warehouse_name, emp.full_name AS employee_name,
           COUNT(l.id)::int AS line_count,
           COUNT(l.id) FILTER (WHERE l.status = 'conciliado')::int AS reconciled_count,
           COUNT(l.id) FILTER (WHERE l.status = 'ignorado')::int AS ignored_count,
           COUNT(l.id) FILTER (WHERE l.status = 'pendiente')::int AS pending_count,
           COUNT(l.id) FILTER (WHERE l.status = 'pendiente' AND l.kind IN ('comision','impuesto','interes'))::int AS pending_charges,
           COALESCE(SUM(l.credit), 0) AS total_credit,
           COALESCE(SUM(l.debit), 0)  AS total_debit,
           COALESCE(SUM(l.credit + l.debit) FILTER (WHERE l.status = 'pendiente'), 0) AS pending_amount
      FROM bank_statements st
      JOIN banks b ON b.id = st.bank_id
      LEFT JOIN currencies c ON c.id = st.currency_id
      LEFT JOIN warehouses w ON w.id = st.warehouse_id
      LEFT JOIN employees emp ON emp.id = st.employee_id
      LEFT JOIN payment_journals pj ON pj.id = st.journal_id
      LEFT JOIN bank_statement_lines l ON l.statement_id = st.id
     WHERE st.company_id = :company_id ${where}
     GROUP BY st.id, b.id, c.id, w.id, emp.id, pj.id
     ORDER BY st.date_to DESC NULLS LAST, st.id DESC
     LIMIT 200
  `, { replacements: rep, type: QT.SELECT });

  return {
    data: rows.map(r => ({
      ...r,
      opening_balance: r.opening_balance === null ? null : parseFloat(r.opening_balance),
      closing_balance: r.closing_balance === null ? null : parseFloat(r.closing_balance),
      total_credit: parseFloat(r.total_credit), total_debit: parseFloat(r.total_debit),
      pending_amount: parseFloat(r.pending_amount),
    })),
  };
}

async function loadStatement(req, id) {
  const companyId = companyOf(req);
  const st = await BankStatement.findByPk(parseInt(id, 10));
  if (!st || st.company_id !== companyId) throw fail("Extracto no encontrado", 404);
  if (st.warehouse_id) await assertWarehouseAccess(req, st.warehouse_id);
  else await assertAccountAccess(req, null);
  return { companyId, st };
}

// Documentos casados con cada línea, con lo necesario para mostrarlos.
async function matchesFor(lineIds) {
  if (!lineIds.length) return [];
  return sequelize.query(`
    SELECT m.line_id, m.source_type, m.source_id, m.role,
           m.amount AS share,
           -- Cuántas líneas comparten este documento (las comisiones registradas en un egreso).
           (SELECT COUNT(*) FROM bank_reconciliation_matches m2
             WHERE m2.source_type = m.source_type AND m2.source_id = m.source_id AND m2.role = m.role)::int AS shared_lines,
           CASE m.source_type
             WHEN 'payment' THEN (p.amount * COALESCE(p.exchange_rate, 1))
             WHEN 'income'  THEN (i.amount * COALESCE(i.rate, 1))
             ELSE (e.amount * COALESCE(e.rate, 1)) END AS amount,
           CASE m.source_type
             WHEN 'payment' THEN COALESCE(s.invoice_number, CONCAT('Cobro #', p.id))
             WHEN 'income'  THEN i.description
             ELSE e.description END AS title,
           CASE m.source_type
             WHEN 'payment' THEN c.name
             WHEN 'income'  THEN CONCAT('INC-', i.id)
             ELSE CONCAT('EGR-', e.id) END AS sub,
           CASE m.source_type
             WHEN 'payment' THEN COALESCE(p.reference_date, ${localDate("p.created_at")})
             WHEN 'income'  THEN ${localDate("COALESCE(i.date, i.created_at)")}
             ELSE ${localDate("COALESCE(e.date, e.created_at)")} END AS day,
           COALESCE(p.reference_number, i.reference) AS ref,
           p.batch_id,
           COALESCE(pmm.name, COALESCE(p.payment_method, i.payment_method, e.payment_method)) AS method_name,
           pj.name AS journal_name
      FROM bank_reconciliation_matches m
      LEFT JOIN payments  p ON m.source_type = 'payment' AND p.id = m.source_id
      LEFT JOIN sales     s ON s.id = p.sale_id
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN incomes   i ON m.source_type = 'income'  AND i.id = m.source_id
      LEFT JOIN expenses  e ON m.source_type = 'expense' AND e.id = m.source_id
      LEFT JOIN payment_journals pj ON pj.id = COALESCE(p.payment_journal_id, i.payment_journal_id, e.payment_journal_id)
      LEFT JOIN payment_methods pmm ON pmm.code = COALESCE(p.payment_method, i.payment_method, e.payment_method)
                                   AND pmm.company_id = COALESCE(p.company_id, i.company_id, e.company_id)
     WHERE m.line_id IN (:ids)
     ORDER BY m.line_id, m.role, m.id
  `, { replacements: { ids: lineIds }, type: QT.SELECT });
}

async function getOne(req, id) {
  const { companyId, st } = await loadStatement(req, id);
  await pruneStale(companyId);

  const [head] = await sequelize.query(`
    SELECT b.name AS bank_name, b.code AS bank_code, c.symbol AS currency_symbol, c.code AS currency_code,
           w.name AS warehouse_name, emp.full_name AS employee_name,
           pj.name AS journal_name, pj.account_number
      FROM bank_statements st
      JOIN banks b ON b.id = st.bank_id
      LEFT JOIN currencies c ON c.id = st.currency_id
      LEFT JOIN warehouses w ON w.id = st.warehouse_id
      LEFT JOIN employees emp ON emp.id = st.employee_id
      LEFT JOIN payment_journals pj ON pj.id = st.journal_id
     WHERE st.id = :id
  `, { replacements: { id: st.id }, type: QT.SELECT });

  const lines = await BankStatementLine.findAll({ where: { statement_id: st.id }, order: [["line_no", "ASC"]], raw: true });
  const matches = await matchesFor(lines.map(l => l.id));
  // Un cobro conjunto son varios Payment (uno por factura) pero un solo pago del cliente: se
  // muestra como una entrada, por su total, igual que en el Estado de Cuenta y en Pagos
  // (ver project-cobro-conjunto). Listarlo factura por factura hacía creer que la línea del
  // banco se había casado con cuatro pagos.
  const byLine = new Map();
  const lots = new Map();
  for (const m of matches) {
    if (!byLine.has(m.line_id)) byLine.set(m.line_id, []);
    if (m.source_type === "payment" && m.batch_id) {
      const k = `${m.line_id}|${m.batch_id}|${m.journal_name}`;
      const lot = lots.get(k);
      if (lot) {
        lot.amount_raw += parseFloat(m.amount) || 0;
        lot.invoices.push(m.title);
        continue;
      }
      const nl = { ...m, amount_raw: parseFloat(m.amount) || 0, invoices: [m.title] };
      lots.set(k, nl);
      byLine.get(m.line_id).push(nl);
      continue;
    }
    byLine.get(m.line_id).push({ ...m, amount: r2(m.amount), share: r2(m.share) });
  }
  for (const lot of lots.values()) {
    lot.invoices.sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true }));
    lot.title = lot.invoices.join(" · ");
    lot.amount = r2(lot.amount_raw);
    lot.invoice_count = lot.invoices.length;
    delete lot.amount_raw; delete lot.invoices;
  }

  const journals = await statementJournals(companyId, st);
  const def = defaultJournal(journals, "out");
  const defIn = defaultJournal(journals, "in");

  return {
    data: {
      ...st.toJSON(),
      ...head,
      currency_symbol: head?.currency_symbol || "Ref.",
      opening_balance: st.opening_balance === null ? null : parseFloat(st.opening_balance),
      closing_balance: st.closing_balance === null ? null : parseFloat(st.closing_balance),
      journals: journals.map(j => ({ id: j.id, name: j.name, type: j.type, active: j.active, allows_outflow: j.allows_outflow, warehouse_ids: j.warehouse_ids })),
      // Para egresos y comisiones (solo diarios que permiten salidas) y para ingresos.
      default_journal_id: def?.id || null,
      default_in_journal_id: defIn?.id || null,
      lines: lines.map(l => ({
        ...l,
        debit: parseFloat(l.debit), credit: parseFloat(l.credit),
        balance: l.balance === null ? null : parseFloat(l.balance),
        difference: parseFloat(l.difference || 0),
        matches: byLine.get(l.id) || [],
      })),
    },
  };
}

async function auto(req, id) {
  const { companyId, st } = await loadStatement(req, id);
  await pruneStale(companyId);
  const matched = await runAuto(companyId, st);
  return { matched };
}

async function remove(req, id) {
  const { st } = await loadStatement(req, id);
  const resolved = await BankStatementLine.count({ where: { statement_id: st.id, status: "conciliado" } });
  if (resolved > 0) {
    throw fail(`Este extracto tiene ${resolved} ${resolved === 1 ? "línea conciliada" : "líneas conciliadas"}. Deshazlas antes de eliminarlo.`);
  }
  await sequelize.transaction(async (t) => {
    await BankStatementLine.destroy({ where: { statement_id: st.id }, transaction: t });
    await st.destroy({ transaction: t });
  });
  return { message: "Extracto eliminado" };
}

module.exports = { create, list, getOne, auto, remove, loadStatement, pruneStale, runAuto };
