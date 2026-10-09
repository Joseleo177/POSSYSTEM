'use strict';

const { sequelize, QT, localDate, r2, cents, TOL, dayDiff, shiftDay, refMatches, lineRefs, lineAmount, lineDir } = require("./shared");

/**
 * Lo que el sistema tiene registrado en una cuenta y todavía no se concilió, en "unidades":
 * cada unidad es lo que debería aparecer como UNA línea en el banco.
 *
 *   · Un cobro corriente es una unidad.
 *   · Un cobro conjunto (batch_id) es una unidad por diario: el cliente hizo un solo pago móvil
 *     por varias facturas, y el banco lo muestra como un solo abono (ver project-cobro-conjunto).
 *   · Un vuelto entregado por el banco (payments.amount < 0) es una salida.
 *   · Ingresos manuales entran; egresos (incluidos los pagos a proveedor) salen.
 *
 * El monto va en la moneda del diario —la del extracto—: amount × tasa, igual que el Estado
 * de Cuenta. La fecha es la que dijo el cajero (reference_date) o, si no la puso, el día del
 * registro.
 */
async function loadUnits(companyId, journalIds, dateFrom, dateTo) {
  if (!journalIds.length) return [];
  const rep = { company_id: companyId, journals: journalIds, date_from: dateFrom, date_to: dateTo };
  const payDay = `COALESCE(p.reference_date, ${localDate("p.created_at")})`;
  const movDay = (a) => localDate(`COALESCE(${a}.date, ${a}.created_at)`);

  const [payments, incomes, expenses] = await Promise.all([
    sequelize.query(`
      SELECT p.id, p.batch_id, p.payment_journal_id AS journal_id, pj.name AS journal_name,
             COALESCE(p.payment_method, pj.type) AS method, pm.name AS method_name,
             (p.amount * COALESCE(p.exchange_rate, 1)) AS amount_local, p.amount AS amount_base,
             ${payDay} AS day, p.created_at, p.reference_number AS ref,
             s.invoice_number, p.sale_id, c.name AS customer_name
        FROM payments p
        JOIN payment_journals pj ON pj.id = p.payment_journal_id
        LEFT JOIN payment_methods pm ON pm.code = COALESCE(p.payment_method, pj.type) AND pm.company_id = p.company_id
        LEFT JOIN sales s     ON s.id = p.sale_id
        LEFT JOIN customers c ON c.id = p.customer_id
       WHERE p.company_id = :company_id
         AND p.payment_journal_id IN (:journals)
         AND p.amount <> 0
         AND ${payDay} BETWEEN :date_from AND :date_to
         AND NOT EXISTS (SELECT 1 FROM bank_reconciliation_matches m WHERE m.source_type = 'payment' AND m.source_id = p.id)
       ORDER BY p.created_at
    `, { replacements: rep, type: QT.SELECT }),
    sequelize.query(`
      SELECT i.id, i.payment_journal_id AS journal_id, pj.name AS journal_name,
             COALESCE(i.payment_method, pj.type) AS method, pm.name AS method_name,
             (i.amount * COALESCE(i.rate, 1)) AS amount_local, i.amount AS amount_base,
             ${movDay("i")} AS day, i.created_at, i.reference AS ref, i.description
        FROM incomes i
        JOIN payment_journals pj ON pj.id = i.payment_journal_id
        LEFT JOIN payment_methods pm ON pm.code = COALESCE(i.payment_method, pj.type) AND pm.company_id = i.company_id
       WHERE i.company_id = :company_id
         AND i.payment_journal_id IN (:journals)
         AND i.status = 'activo'
         AND ${movDay("i")} BETWEEN :date_from AND :date_to
         AND NOT EXISTS (SELECT 1 FROM bank_reconciliation_matches m WHERE m.source_type = 'income' AND m.source_id = i.id)
       ORDER BY i.created_at
    `, { replacements: rep, type: QT.SELECT }),
    // La referencia de un pago a proveedor está en su PurchasePayment: el egreso guarda una
    // clave interna (ver utils/expenseReference.js), que no es un número de transferencia.
    sequelize.query(`
      SELECT e.id, e.payment_journal_id AS journal_id, pj.name AS journal_name,
             COALESCE(e.payment_method, pj.type) AS method, pm.name AS method_name,
             (e.amount * COALESCE(e.rate, 1)) AS amount_local, e.amount AS amount_base,
             ${movDay("e")} AS day, e.created_at, e.description,
             COALESCE(ppr.reference_number,
                      CASE WHEN e.reference LIKE 'purchase_%' THEN NULL ELSE e.reference END) AS ref
        FROM expenses e
        JOIN payment_journals pj ON pj.id = e.payment_journal_id
        LEFT JOIN payment_methods pm ON pm.code = COALESCE(e.payment_method, pj.type) AND pm.company_id = e.company_id
        LEFT JOIN LATERAL (
          SELECT pp.reference_number FROM purchase_payments pp
           WHERE pp.company_id = e.company_id AND pp.reference_number IS NOT NULL AND (
                 (e.reference LIKE 'purchase_payment:%' AND pp.id::text = split_part(e.reference, ':', 2))
              OR (e.reference LIKE 'purchase_batch:%' AND replace(pp.batch_id, '-', '') = replace(split_part(e.reference, ':', 2), '-', ''))
           )
           LIMIT 1
        ) ppr ON TRUE
       WHERE e.company_id = :company_id
         AND e.payment_journal_id IN (:journals)
         AND e.status = 'activo'
         AND ${movDay("e")} BETWEEN :date_from AND :date_to
         AND NOT EXISTS (SELECT 1 FROM bank_reconciliation_matches m WHERE m.source_type = 'expense' AND m.source_id = e.id)
       ORDER BY e.created_at
    `, { replacements: rep, type: QT.SELECT }),
  ]);

  const units = [];
  const day = (d) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

  // Cobros: los de un mismo lote y diario se suman en una sola unidad.
  const lotes = new Map();
  for (const p of payments) {
    const amount = parseFloat(p.amount_local);
    if (amount < 0) {
      units.push({
        key: `p:${p.id}`, type: "payment", ids: [p.id], dir: "out",
        amount: r2(-amount), day: day(p.day), created_at: p.created_at, ref: p.ref,
        title: `Vuelto ${p.invoice_number || `#${p.sale_id}`}`, sub: p.customer_name || null,
        journal_id: p.journal_id, journal_name: p.journal_name, method: p.method, method_name: p.method_name || p.method,
      });
      continue;
    }
    if (p.batch_id) {
      const k = `${p.batch_id}|${p.journal_id}|${p.method}`;
      const u = lotes.get(k);
      if (u) {
        u.ids.push(p.id);
        u.amount_raw += amount;
        if (p.invoice_number && !u.invoices.includes(p.invoice_number)) u.invoices.push(p.invoice_number);
        continue;
      }
      const nu = {
        key: `b:${k}`, type: "payment", ids: [p.id], dir: "in", amount_raw: amount,
        day: day(p.day), created_at: p.created_at, ref: p.ref, invoices: [p.invoice_number || `#${p.sale_id}`],
        sub: p.customer_name || null,
        journal_id: p.journal_id, journal_name: p.journal_name, method: p.method, method_name: p.method_name || p.method,
      };
      lotes.set(k, nu);
      units.push(nu);
      continue;
    }
    units.push({
      key: `p:${p.id}`, type: "payment", ids: [p.id], dir: "in",
      amount: r2(amount), day: day(p.day), created_at: p.created_at, ref: p.ref,
      title: p.invoice_number || `Cobro #${p.id}`, sub: p.customer_name || null,
      journal_id: p.journal_id, journal_name: p.journal_name, method: p.method, method_name: p.method_name || p.method,
    });
  }
  for (const u of lotes.values()) {
    u.amount = r2(u.amount_raw);
    u.invoices.sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true }));
    u.title = u.invoices.join(" · ");
    u.invoice_count = u.invoices.length;
    delete u.amount_raw; delete u.invoices;
  }

  for (const i of incomes) {
    units.push({
      key: `i:${i.id}`, type: "income", ids: [i.id], dir: "in",
      amount: r2(i.amount_local), day: day(i.day), created_at: i.created_at, ref: i.ref,
      title: i.description || `Ingreso #${i.id}`, sub: `INC-${i.id}`,
      journal_id: i.journal_id, journal_name: i.journal_name, method: i.method, method_name: i.method_name || i.method,
    });
  }
  for (const e of expenses) {
    units.push({
      key: `e:${e.id}`, type: "expense", ids: [e.id], dir: "out",
      amount: r2(e.amount_local), day: day(e.day), created_at: e.created_at, ref: e.ref,
      title: e.description || `Egreso #${e.id}`, sub: `EGR-${e.id}`,
      journal_id: e.journal_id, journal_name: e.journal_name, method: e.method, method_name: e.method_name || e.method,
    });
  }
  return units;
}

// Métodos que el banco liquida en lote: el punto de venta y el biopago no abonan cobro por
// cobro, sino la suma del día, al día siguiente y con la comisión ya descontada. Es el método
// del cobro el que cuenta, no el diario: desde que el diario es la cuenta, "Banco de
// Venezuela" recibe pago móvil, punto y biopago a la vez.
const LOT_METHODS = ["punto_venta", "biopago"];

// Lotes candidatos para un abono: cobros de un diario de punto agrupados por día, de los
// cinco días anteriores. Un lote encaja si el banco abonó entre el 90 % y el 100 % de la suma;
// lo que falta es la comisión que se quedó el banco.
function lotSuggestions(line, units) {
  if (lineDir(line) !== "in") return [];
  const amount = lineAmount(line);
  const groups = new Map();
  for (const u of units) {
    if (u.dir !== "in" || u.type !== "payment" || !LOT_METHODS.includes(u.method)) continue;
    const dd = dayDiff(u.day, line.date);
    if (dd < 0 || dd > 5) continue;
    const k = `${u.journal_id}|${u.method}|${u.day}`;
    if (!groups.has(k)) groups.set(k, { key: `lot:${k}`, journal_id: u.journal_id, journal_name: u.journal_name, method_name: u.method_name, day: u.day, units: [], sum: 0 });
    const g = groups.get(k);
    g.units.push(u);
    g.sum += u.amount;
  }
  const out = [];
  for (const g of groups.values()) {
    const sum = r2(g.sum);
    const commission = r2(sum - amount);
    if (commission < -TOL) continue;                 // el banco abonó más de lo cobrado
    if (amount < sum * 0.9) continue;                // demasiada diferencia para ser comisión
    // Un cobro solo y exacto no es un lote: ya sale como candidato normal. Sí lo es si el
    // banco le descontó comisión (un día con una sola venta por punto).
    if (g.units.length < 2 && Math.abs(commission) <= TOL) continue;
    out.push({
      key: g.key, journal_id: g.journal_id, journal_name: g.journal_name, method_name: g.method_name, day: g.day,
      count: g.units.length, sum, commission: Math.abs(commission) <= TOL ? 0 : commission,
      pct: sum > 0 && commission > TOL ? Math.round((commission / sum) * 10000) / 100 : 0,
      unit_keys: g.units.map(u => u.key),
    });
  }
  return out.sort((a, b) => a.commission - b.commission || dayDiff(b.day, a.day));
}

/**
 * Casamiento automático. Solo junta lo que no admite duda:
 *
 *   1. Mismo monto y la referencia coincide (±7 días).
 *   2. Mismo monto, ±3 días, y es la ÚNICA pareja posible en los dos sentidos: la línea tiene
 *      un solo candidato y ese candidato no le sirve a ninguna otra línea.
 *   3. Montos repetidos el mismo día (tres pagos móviles de Bs 100 sin referencia): si hay
 *      tantas líneas como documentos, se emparejan en orden. Cualquier reparto da lo mismo.
 *   4. Lote del punto que cuadra exacto con el abono (sin comisión descontada).
 *
 * Lo demás —lotes con comisión, montos parecidos— queda como sugerencia para el usuario.
 * Devuelve [{ line, units: [unit...] }].
 */
function autoMatch(lines, units) {
  const used = new Set();
  const done = new Set();
  const pairs = [];
  const take = (line, us) => { us.forEach(u => used.add(u.key)); done.add(line.id); pairs.push({ line, units: us }); };

  const prepared = lines.map(l => ({ l, dir: lineDir(l), amount: lineAmount(l), refs: lineRefs(l) }));
  const fits = (p, u, days) =>
    !used.has(u.key) && u.dir === p.dir && Math.abs(u.amount - p.amount) <= TOL && Math.abs(dayDiff(p.l.date, u.day)) <= days;

  // 1. Referencia
  for (const p of prepared) {
    const c = units.filter(u => fits(p, u, 7) && refMatches(p.refs, u.ref));
    if (!c.length) continue;
    c.sort((a, b) => Math.abs(dayDiff(p.l.date, a.day)) - Math.abs(dayDiff(p.l.date, b.day)));
    take(p.l, [c[0]]);
  }

  // 2. Pareja única en los dos sentidos. Se repite porque cada pareja tomada puede dejar a
  // otra línea con un solo candidato.
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prepared) {
      if (done.has(p.l.id)) continue;
      const c = units.filter(u => fits(p, u, 3));
      if (c.length !== 1) continue;
      const rivals = prepared.filter(q => !done.has(q.l.id) && fits(q, c[0], 3));
      if (rivals.length !== 1) continue;
      take(p.l, c);
      changed = true;
    }
  }

  // 3. Montos repetidos el mismo día
  const groups = new Map();
  for (const p of prepared) {
    if (done.has(p.l.id)) continue;
    const k = `${p.dir}|${cents(p.amount)}|${p.l.date}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  for (const [k, ps] of groups) {
    if (ps.length < 2) continue;
    const [dir, c, date] = k.split("|");
    const us = units.filter(u => !used.has(u.key) && u.dir === dir && Math.abs(cents(u.amount) - Number(c)) <= 1 && u.day === date);
    if (us.length !== ps.length) continue;
    us.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    ps.sort((a, b) => a.l.line_no - b.l.line_no);
    ps.forEach((p, i) => take(p.l, [us[i]]));
  }

  // 4. Lote del punto exacto
  for (const p of prepared) {
    if (done.has(p.l.id) || p.dir !== "in") continue;
    const free = units.filter(u => !used.has(u.key));
    const exact = lotSuggestions(p.l, free).filter(s => s.commission === 0);
    if (exact.length !== 1) continue;
    take(p.l, exact[0].unit_keys.map(k => free.find(u => u.key === k)));
  }

  return pairs;
}

// Ventana de fechas que hay que traer para un conjunto de líneas.
function windowFor(lines, before = 7, after = 7) {
  const dates = lines.map(l => String(l.date).slice(0, 10)).sort();
  return { from: shiftDay(dates[0], -before), to: shiftDay(dates[dates.length - 1], after) };
}

module.exports = { loadUnits, lotSuggestions, autoMatch, windowFor, LOT_METHODS };
