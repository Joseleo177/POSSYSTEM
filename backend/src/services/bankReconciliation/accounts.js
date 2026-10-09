'use strict';

const { sequelize, QT, fail, companyOf } = require("./shared");
const { visibleWarehouseIds, assertWarehouseAccess, isAdmin } = require("../../middleware/auth");

/**
 * Cuenta bancaria = diario.
 *
 * Desde la migración journal-accounts el diario ES la cuenta (Banco de Venezuela, con sus
 * métodos: pago móvil, punto, biopago), así que cada extracto se concilia contra un diario.
 * Dos cuentas del mismo banco y moneda (Venezuela 1 y 2) ya no se mezclan.
 *
 * Los extractos viejos sin journal_id siguen resolviéndose como antes, por banco + moneda
 * (accountJournals). Los diarios de efectivo no van: su "banco" es la gaveta.
 */

const serves = (j, wid) => !wid || !j.warehouse_ids.length || j.warehouse_ids.includes(wid);

async function journalRows(companyId, where = "", replacements = {}) {
  const rows = await sequelize.query(`
    SELECT pj.id, pj.name, pj.type, pj.color, pj.active, pj.sort_order, pj.bank_id, pj.currency_id,
           pj.account_number,
           b.name AS bank_name, b.code AS bank_code,
           c.code AS currency_code, c.symbol AS currency_symbol, c.is_base AS currency_is_base,
           c.exchange_rate AS currency_rate,
           -- Una cuenta de solo cobros no registra egresos: paga si alguno de sus métodos paga.
           EXISTS (SELECT 1 FROM payment_journal_methods m
                    WHERE m.journal_id = pj.id AND m.allows_outflow) AS allows_outflow,
           COALESCE(array_agg(pjw.warehouse_id) FILTER (WHERE pjw.warehouse_id IS NOT NULL), '{}') AS warehouse_ids
      FROM payment_journals pj
      JOIN banks b ON b.id = pj.bank_id
      LEFT JOIN currencies c ON c.id = pj.currency_id
      LEFT JOIN payment_journal_warehouses pjw ON pjw.journal_id = pj.id
     WHERE pj.company_id = :company_id
       AND COALESCE(pj.type, '') <> 'efectivo'
       ${where}
     GROUP BY pj.id, b.id, c.id
     ORDER BY pj.sort_order, pj.id
  `, { replacements: { company_id: companyId, ...replacements }, type: QT.SELECT });
  return rows.map(r => ({ ...r, warehouse_ids: (r.warehouse_ids || []).map(Number) }));
}

// Diarios que forman la cuenta. Incluye los inactivos: un cobro viejo en un diario apagado
// sigue siendo dinero que entró a esa cuenta y tiene que poder conciliarse.
async function accountJournals(companyId, bankId, currencyId, warehouseId = null) {
  const rows = await journalRows(companyId,
    `AND pj.bank_id = :bank_id AND pj.currency_id IS NOT DISTINCT FROM :currency_id`,
    { bank_id: parseInt(bankId, 10), currency_id: currencyId ? parseInt(currencyId, 10) : null });
  return rows.filter(j => serves(j, warehouseId ? parseInt(warehouseId, 10) : null));
}

// Diarios contra los que se concilia un extracto: el suyo, o los del banco y moneda si es un
// extracto anterior a que el diario fuera la cuenta.
async function statementJournals(companyId, st) {
  if (st.journal_id) return journalRows(companyId, `AND pj.id = :jid`, { jid: parseInt(st.journal_id, 10) });
  return accountJournals(companyId, st.bank_id, st.currency_id, st.warehouse_id);
}

// Un encargado solo concilia cuentas de su sucursal; el admin puede tomar la cuenta entera.
async function assertAccountAccess(req, warehouseId) {
  if (warehouseId) return assertWarehouseAccess(req, warehouseId);
  if (!isAdmin(req)) throw fail("Indica la sucursal de esta cuenta");
}

// Diario por omisión para registrar lo que sale del extracto: el de transferencias si existe,
// que es el movimiento bancario por excelencia; si no, pago móvil, y si no, el primero.
// Para un egreso (`dir` 'out') solo cuentan los diarios que permiten salidas: en una cuenta
// donde se cobra por biopago y se paga por pago móvil, la comisión va al de pago móvil.
const PREFERRED = ["transferencia", "pago_movil", "punto_venta"];
function defaultJournal(journals, dir = "out") {
  const usable = dir === "out" ? journals.filter(j => j.allows_outflow) : journals;
  const activos = usable.filter(j => j.active);
  const pool = activos.length ? activos : usable;
  for (const t of PREFERRED) {
    const j = pool.find(x => x.type === t);
    if (j) return j;
  }
  return pool[0] || null;
}

// Cuentas que el usuario puede conciliar, con lo pendiente de cada una.
async function listAccounts(req) {
  const companyId = companyOf(req);
  const allowed = await visibleWarehouseIds(req);
  const rows = (await journalRows(companyId, `AND pj.active = TRUE AND pj.merged_into_id IS NULL`))
    .filter(j => allowed === null || !j.warehouse_ids.length || j.warehouse_ids.some(w => allowed.includes(w)));

  // Una cuenta por diario.
  const accounts = rows.map(j => ({
    key: `j${j.id}`, journal_id: j.id, journal_name: j.name, account_number: j.account_number || null,
    bank_id: j.bank_id, bank_name: j.bank_name, bank_code: j.bank_code,
    currency_id: j.currency_id, currency_code: j.currency_code,
    currency_symbol: j.currency_symbol || "Ref.",
    journals: [{ id: j.id, name: j.name, type: j.type, warehouse_ids: j.warehouse_ids }],
    warehouse_ids: [...j.warehouse_ids],
  }));
  if (!accounts.length) return { data: [] };

  const whScope = allowed === null ? "" : `AND st.warehouse_id IN (${allowed.filter(Number.isInteger).join(",") || "NULL"})`;
  const stats = await sequelize.query(`
    SELECT st.journal_id,
           COUNT(DISTINCT st.id)::int AS statements,
           MAX(st.date_to) AS last_date,
           COUNT(l.id) FILTER (WHERE l.status = 'pendiente')::int AS pending_lines
      FROM bank_statements st
      LEFT JOIN bank_statement_lines l ON l.statement_id = st.id
     WHERE st.company_id = :company_id ${whScope}
     GROUP BY st.journal_id
  `, { replacements: { company_id: companyId }, type: QT.SELECT });

  for (const a of accounts) {
    const s = stats.find(x => x.journal_id === a.journal_id);
    a.statements = s?.statements || 0;
    a.last_date = s?.last_date || null;
    a.pending_lines = s?.pending_lines || 0;
  }
  accounts.sort((a, b) => a.bank_name.localeCompare(b.bank_name) || String(a.currency_code).localeCompare(String(b.currency_code))
    || String(a.account_number || "").localeCompare(String(b.account_number || "")));
  return { data: accounts };
}

module.exports = { accountJournals, statementJournals, journalRows, assertAccountAccess, defaultJournal, listAccounts };
