'use strict';

const {
  sequelize, fail, r2, TOL, dayDiff, shiftDay, refMatches, lineRefs, lineAmount, lineDir,
  BankStatementLine, BankReconciliationMatch,
} = require("./shared");
const { statementJournals, defaultJournal } = require("./accounts");
const { loadUnits, lotSuggestions } = require("./candidates");
const { createDocForLine, createDocForLines, groupedLineIds, voidCreatedDocs } = require("./documents");
const { loadStatement, pruneStale } = require("./statements");

async function loadLine(st, lineId, t) {
  const line = await BankStatementLine.findOne({
    where: { id: parseInt(lineId, 10), statement_id: st.id },
    transaction: t, lock: t ? t.LOCK.UPDATE : undefined,
  });
  if (!line) throw fail("Línea no encontrada", 404);
  return line;
}

const plainLine = (l) => (l.get ? l.get({ plain: true }) : l);

function pickJournal(journals, journalId, dir = "out") {
  if (journalId) {
    const j = journals.find(x => x.id === parseInt(journalId, 10));
    if (!j) throw fail("Ese diario no pertenece a la cuenta del extracto");
    if (dir === "out" && !j.allows_outflow) throw fail(`${j.name} solo recibe cobros: elige un diario que permita salidas`);
    return j;
  }
  const j = defaultJournal(journals, dir);
  if (!j) {
    throw fail(dir === "out"
      ? "Ningún diario de esta cuenta permite salidas. Actívalo en Tipos de pago para el método que uses para pagar."
      : "La cuenta no tiene diarios donde registrar");
  }
  return j;
}

/**
 * Qué puede explicar una línea pendiente.
 *
 *   candidates  documentos del mismo sentido en ±`days` días, primero los de monto exacto y
 *               referencia, luego los de monto exacto, luego por cercanía del monto. El
 *               usuario puede marcar varios: una transferencia que pagó dos facturas sueltas.
 *   lots        lotes del punto de venta del día anterior que, descontada la comisión, dan el
 *               abono. Es como el banco liquida el punto: la suma del día menos su comisión.
 */
async function candidates(req, id, lineId, query = {}) {
  const { companyId, st } = await loadStatement(req, id);
  const line = plainLine(await loadLine(st, lineId));
  const days = Math.min(Math.max(parseInt(query.days, 10) || 10, 1), 60);
  const journals = await statementJournals(companyId, st);
  const date = String(line.date).slice(0, 10);
  const units = await loadUnits(companyId, journals.map(j => j.id), shiftDay(date, -days), shiftDay(date, days));

  const dir = lineDir(line);
  const amount = lineAmount(line);
  const refs = lineRefs(line);
  const q = String(query.q || "").trim().toLowerCase();

  const list = units
    .filter(u => u.dir === dir)
    .map(u => ({
      ...u,
      exact: Math.abs(u.amount - amount) <= TOL,
      ref_match: refMatches(refs, u.ref),
      day_diff: dayDiff(date, u.day),
    }))
    .filter(u => !q || [u.title, u.sub, u.ref, u.journal_name, String(u.amount)].some(v => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) =>
      (b.exact && b.ref_match) - (a.exact && a.ref_match) ||
      b.exact - a.exact ||
      b.ref_match - a.ref_match ||
      Math.abs(a.amount - amount) - Math.abs(b.amount - amount) ||
      Math.abs(a.day_diff) - Math.abs(b.day_diff))
    .slice(0, 150);

  const lots = line.status === "pendiente" ? lotSuggestions(line, units).slice(0, 5) : [];
  return { data: { candidates: list, lots } };
}

/**
 * Casa una línea con documentos elegidos a mano.
 *
 * `keys` son claves de unidad (p:<id>, b:<lote>|<diario>, i:<id>, e:<id>) tal como las dio
 * `candidates`: se vuelven a cargar del servidor, nunca se confía en el monto del navegador.
 *
 * Si la suma no da el monto del banco, la diferencia solo se acepta como comisión, y solo en
 * el sentido en que el banco cobra: abonó menos de lo que se cobró, o cargó más de lo que se
 * pagó. `register_commission` la registra como egreso en el diario de la cuenta.
 */
async function match(req, id, lineId, body = {}) {
  const { companyId, st } = await loadStatement(req, id);
  const keys = [...new Set((Array.isArray(body.keys) ? body.keys : []).map(String))];
  if (!keys.length) throw fail("Elige al menos un movimiento del sistema");

  const journals = await statementJournals(companyId, st);

  return sequelize.transaction(async (t) => {
    const line = await loadLine(st, lineId, t);
    if (line.status !== "pendiente") throw fail("Esta línea ya está resuelta");
    const pl = plainLine(line);
    const date = String(pl.date).slice(0, 10);

    // Se buscan en una ventana amplia: el usuario pudo ampliar la búsqueda en pantalla.
    const units = await loadUnits(companyId, journals.map(j => j.id), shiftDay(date, -60), shiftDay(date, 60));
    const chosen = keys.map(k => units.find(u => u.key === k));
    if (chosen.some(u => !u)) throw fail("Uno de los movimientos ya no está disponible: se concilió o se anuló. Vuelve a cargar la línea.");

    const dir = lineDir(pl);
    if (chosen.some(u => u.dir !== dir)) {
      throw fail(dir === "in" ? "Un abono del banco solo se casa con cobros o ingresos" : "Un cargo del banco solo se casa con egresos o vueltos");
    }

    const amount = lineAmount(pl);
    const sum = r2(chosen.reduce((s, u) => s + u.amount, 0));
    // Positivo = lo que el banco se quedó (abonó menos, o cargó de más).
    const commission = r2(dir === "in" ? sum - amount : amount - sum);
    const sym = body.currency_symbol || "";

    let created = null;
    if (Math.abs(commission) > TOL) {
      if (commission < 0) {
        throw fail(dir === "in"
          ? `El banco abonó ${sym} ${(-commission).toFixed(2)} más de lo seleccionado. Agrega el movimiento que falta.`
          : `Lo seleccionado supera el cargo del banco por ${sym} ${(-commission).toFixed(2)}. Quita algún movimiento.`);
      }
      if (!body.register_commission) {
        throw fail(`Falta explicar ${sym} ${commission.toFixed(2)}. Regístralo como comisión o ajusta la selección.`);
      }
      const journal = pickJournal(journals, body.journal_id);
      created = await createDocForLine(req, {
        companyId, statement: st, line: pl, journal, kind: "comision", amountLocal: commission,
        description: `Comisión bancaria · ${pl.description || "liquidación"}`.slice(0, 255),
        warehouseId: body.warehouse_id, t,
      });
    }

    const rows = chosen.flatMap(u => u.ids.map(sid => ({
      company_id: companyId, line_id: pl.id, source_type: u.type, source_id: sid, role: "documento",
      amount: u.ids.length === 1 ? u.amount : 0,
    })));
    try {
      await BankReconciliationMatch.bulkCreate(rows, { transaction: t });
    } catch (e) {
      if (e.name === "SequelizeUniqueConstraintError") throw fail("Uno de los movimientos ya se concilió con otra línea");
      throw e;
    }
    await line.update({
      status: "conciliado", match_mode: "manual", difference: created ? commission : 0,
      resolved_by: req.employee.id, resolved_at: new Date(),
    }, { transaction: t });
    return { ok: true, commission: created ? commission : 0, created };
  });
}

/**
 * Registra en el sistema un movimiento que solo conoce el banco: una comisión, un interés, una
 * transferencia recibida que nadie cargó. Crea el egreso (cargo) o ingreso (abono) por el
 * monto exacto de la línea y lo deja conciliado con ella.
 */
async function register(req, id, lineId, body = {}) {
  const { companyId, st } = await loadStatement(req, id);
  const journals = await statementJournals(companyId, st);
  return sequelize.transaction(async (t) => {
    const line = await loadLine(st, lineId, t);
    if (line.status !== "pendiente") throw fail("Esta línea ya está resuelta");
    const pl = plainLine(line);
    const dir = lineDir(pl);
    const journal = pickJournal(journals, body.journal_id, dir);

    // Sin categoría elegida, la línea marcada por el banco va a su categoría propia.
    const kind = body.category_id ? (dir === "in" ? "ingreso" : "egreso")
      : (dir === "in" ? "interes" : (pl.kind === "impuesto" ? "impuesto" : "comision"));
    const created = await createDocForLine(req, {
      companyId, statement: st, line: pl, journal, kind,
      amountLocal: lineAmount(pl),
      description: body.description || pl.description,
      categoryId: body.category_id || null,
      warehouseId: body.warehouse_id, t,
    });
    await line.update({
      status: "conciliado", match_mode: "registrado", difference: 0,
      resolved_by: req.employee.id, resolved_at: new Date(),
    }, { transaction: t });
    return { ok: true, created };
  });
}

/**
 * Registra de una vez lo que el banco marcó como suyo: comisiones e impuestos (egresos) e
 * intereses (ingresos). Es lo que más líneas tiene en un extracto y lo único que nunca está en
 * el sistema, porque nadie lo carga a mano.
 */
async function registerCharges(req, id, body = {}) {
  const { companyId, st } = await loadStatement(req, id);
  const journals = await statementJournals(companyId, st);
  const journal = pickJournal(journals, body.journal_id);
  return sequelize.transaction(async (t) => {
    const lines = await BankStatementLine.findAll({
      where: { statement_id: st.id, status: "pendiente", kind: ["comision", "impuesto", "interes"] },
      order: [["line_no", "ASC"]], transaction: t, lock: t.LOCK.UPDATE,
    });
    if (!lines.length) throw fail("No hay comisiones pendientes en este extracto");

    // Un documento por tipo, no uno por línea: un mes del BDV son ~100 cargos de Bs 14 y
    // llenaban la lista de Egresos. Comisiones e impuestos van en egresos aparte (categorías
    // distintas); los intereses, en un ingreso.
    const NOMBRE = { comision: "Comisiones bancarias", impuesto: "Impuestos bancarios", interes: "Intereses bancarios" };
    const fecha = (d) => String(d).slice(0, 10).split("-").reverse().join("/");
    let total = 0;
    const docs = [];
    for (const kind of ["comision", "impuesto", "interes"]) {
      const grupo = lines.filter(l => l.kind === kind).map(plainLine);
      if (!grupo.length) continue;
      const desde = grupo[0].date, hasta = grupo[grupo.length - 1].date;
      const periodo = desde === hasta ? fecha(desde) : `${fecha(desde)} al ${fecha(hasta)}`;
      const doc = await createDocForLines(req, {
        companyId, statement: st, lines: grupo, journal, kind,
        description: `${NOMBRE[kind]} · ${journal.name} · ${periodo} · ${grupo.length} ${kind === "interes" ? (grupo.length === 1 ? "abono" : "abonos") : (grupo.length === 1 ? "cargo" : "cargos")}`.slice(0, 255),
        warehouseId: body.warehouse_id, t,
      });
      docs.push(doc);
      total += doc.amount;
    }
    await BankStatementLine.update(
      { status: "conciliado", match_mode: "registrado", resolved_by: req.employee.id, resolved_at: new Date() },
      { where: { id: lines.map(l => l.id) }, transaction: t },
    );
    return { ok: true, count: lines.length, documents: docs.length, total: r2(total) };
  });
}

// Línea que no corresponde a nada del sistema y no debe registrarse: un traspaso entre
// cuentas propias, un abono reversado el mismo día.
async function ignore(req, id, lineId, body = {}) {
  const { st } = await loadStatement(req, id);
  const line = await loadLine(st, lineId);
  if (line.status !== "pendiente") throw fail("Esta línea ya está resuelta");
  await line.update({
    status: "ignorado", match_mode: null,
    note: body.note ? String(body.note).slice(0, 255) : null,
    resolved_by: req.employee.id, resolved_at: new Date(),
  });
  return { ok: true };
}

// Deshace: la línea vuelve a pendiente y lo que la conciliación había creado se anula.
async function unmatch(req, id, lineId) {
  const { companyId, st } = await loadStatement(req, id);
  let undone = 0;
  await sequelize.transaction(async (t) => {
    const line = await loadLine(st, lineId, t);
    if (line.status === "pendiente") throw fail("Esta línea no está resuelta");
    // Las comisiones registradas juntas comparten un egreso: se deshacen todas.
    const ids = await groupedLineIds([line.id], t);
    await voidCreatedDocs(ids, t);
    await BankReconciliationMatch.destroy({ where: { line_id: ids }, transaction: t });
    await BankStatementLine.update({
      status: "pendiente", match_mode: null, difference: 0, note: null, resolved_by: null, resolved_at: null,
    }, { where: { id: ids }, transaction: t });
    undone = ids.length;
  });
  await pruneStale(companyId);
  return { ok: true, undone };
}

module.exports = { candidates, match, register, registerCharges, ignore, unmatch };
