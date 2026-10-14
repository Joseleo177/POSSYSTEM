const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, localDate } = require("./shared");

// Ingresos y egresos del período: el "resumen de finanzas" mensual que las tiendas llevaban en
// Excel (ingresos por día y forma de pago, egresos uno por uno, y la relación entre los dos).
//
// Todo es DINERO que entró o salió, así que se corta por la fecha del movimiento, nunca por la
// de la venta o la compra (ver paymentJournalsReport):
//  - Ingresos: cobros de ventas por día y por método, menos el vuelto que salió por ese mismo
//    método. El cobro guarda el billete completo que entregó el cliente y el vuelto queda como
//    egreso "Cambio / Vuelto"; sin restarlo, el ingreso salía inflado por el vuelto y el egreso
//    también. Los ingresos cargados a mano van en su propia columna: no son ventas.
//  - Egresos: todo lo que salió de caja (pagos a proveedores, gastos, devoluciones a clientes)
//    salvo el vuelto, que ya se descontó del ingreso.
//
// Montos: `amount` está en moneda base y `exchange_rate`/`rate` es la tasa de ese movimiento,
// así que amount × tasa devuelve lo que se contó en la moneda de la caja.

const CAMBIO = "Cambio / Vuelto";
const COMPRA = "Pagos a Proveedores";
const DEVOLUCION = "Devolución de Crédito";

// "Factura 1234", "Nota de entrega 208432", "NE-55", "45020490"… El número del documento del
// proveedor vive en el texto libre de la compra ("Notas o factura del proveedor") o en la
// referencia del egreso ("Factura / recibo"); de ahí se separan el tipo y el número. Si el texto
// no se deja leer, se publica tal cual en `doc_text` para que nada se pierda.
const TIPOS = [
  [/^(nota\s+de\s+entrega|nota\s+entrega|n\/?e)$/i, "Nota de entrega"],
  [/^(nota\s+de\s+venta|n\/?v)$/i, "Nota de venta"],
  [/^(fact(ura)?|fac|fc)\.?$/i, "Factura"],
  [/^(nota)$/i, "Nota"],
  [/^(recibo|rec)\.?$/i, "Recibo"],
];
function parseDocument(text) {
  const raw = String(text || "").trim();
  if (!raw) return { doc_type: null, doc_number: null, doc_text: null };
  const m = raw.match(/^\s*(nota\s+de\s+entrega|nota\s+entrega|nota\s+de\s+venta|n\/?e|n\/?v|factura|fact\.?|fac\.?|fc|nota|recibo|rec\.?)\s*(?:n[°º.o]*\s*|#\s*|:\s*|-\s*)*([A-Za-z0-9][A-Za-z0-9-]*\d[A-Za-z0-9-]*|\d+)/i);
  if (m) {
    const tipo = TIPOS.find(([re]) => re.test(m[1].replace(/\s+/g, " ").trim()));
    return { doc_type: tipo ? tipo[1] : null, doc_number: m[2], doc_text: raw };
  }
  const solo = raw.match(/^\s*#?\s*(\d[\d-]{2,})\b/);
  if (solo) return { doc_type: null, doc_number: solo[1], doc_text: raw };
  return { doc_type: null, doc_number: null, doc_text: raw };
}

async function financeReport({ date_from, date_to, company_id, allowedWarehouses, warehouse_id }) {
  const from = sanitizeDate(date_from);
  const to   = sanitizeDate(date_to);

  const wid = warehouse_id ? parseInt(warehouse_id) : null;
  if (wid && Array.isArray(allowedWarehouses) && !allowedWarehouses.includes(wid)) {
    const e = new Error("No tienes acceso a este almacén"); e.status = 403; e.isOperational = true; throw e;
  }

  const rep = { cid: company_id, cambio: CAMBIO, compra: COMPRA, devolucion: DEVOLUCION };
  const scoped = !!company_id;
  if (from) rep.dfrom = from;
  if (to)   rep.dto   = to;

  // Un cobro no guarda sucursal: la hereda de su venta (misma subconsulta que Diarios de Pago).
  let payWh = "";
  if (wid) payWh = `AND p.sale_id IN (SELECT id FROM sales WHERE warehouse_id = ${wid})`;
  else if (Array.isArray(allowedWarehouses)) {
    const ids = allowedWarehouses.filter(Number.isInteger);
    payWh = ids.length ? `AND p.sale_id IN (SELECT id FROM sales WHERE warehouse_id IN (${ids.join(",")}))` : "AND FALSE";
  }
  const manualWh = (a) => {
    if (wid) return `AND ${a}.warehouse_id = ${wid}`;
    if (!Array.isArray(allowedWarehouses)) return "";
    const ids = allowedWarehouses.filter(Number.isInteger);
    return ids.length ? `AND ${a}.warehouse_id IN (${ids.join(",")})` : "AND FALSE";
  };
  const rango = (col) => [from && `AND ${col} >= :dfrom`, to && `AND ${col} <= :dto`].filter(Boolean).join(" ");

  const diaPago   = localDate("p.created_at");
  const diaManual = (a) => localDate(`COALESCE(${a}.date, ${a}.created_at)`);
  const metodo    = (a) => `COALESCE(NULLIF(${a}.payment_method, ''), pj.type)`;
  const q = (sql) => sequelize.query(sql, { replacements: rep, type: Sequelize.QueryTypes.SELECT });

  // ── Ingresos: cobros por día × método × moneda de la caja ──────────────────────────────
  // `rate_mode`: la tasa con que se cobró en bolívares ese día. No hay historial de la tasa
  // BCV; la que quedó guardada en los cobros es la que de verdad se aplicó.
  const cobros = await q(`
    SELECT ${diaPago} AS day, ${metodo("p")} AS metodo, pj.currency_id,
           COUNT(p.id)::int AS tx_count,
           COALESCE(SUM(p.amount * COALESCE(p.exchange_rate, 1)), 0)::float AS amount_journal,
           COALESCE(SUM(p.amount), 0)::float AS amount_base
      FROM payments p
      JOIN payment_journals pj ON pj.id = p.payment_journal_id
     WHERE p.payment_journal_id IS NOT NULL
       ${scoped ? "AND p.company_id = :cid" : ""}
       ${payWh}
       ${rango(diaPago)}
     GROUP BY day, metodo, pj.currency_id`);

  const tasas = await q(`
    SELECT ${diaPago} AS day,
           (MODE() WITHIN GROUP (ORDER BY p.exchange_rate))::float AS rate
      FROM payments p
     WHERE p.exchange_rate > 1
       ${scoped ? "AND p.company_id = :cid" : ""}
       ${payWh}
       ${rango(diaPago)}
     GROUP BY day`);

  // Vuelto: sale de la caja y por el método por el que se entregó. Se resta de ESA columna.
  const vueltos = await q(`
    SELECT ${diaManual("e")} AS day, ${metodo("e")} AS metodo, pj.currency_id,
           COALESCE(SUM(e.amount * COALESCE(e.rate, 1)), 0)::float AS amount_journal,
           COALESCE(SUM(e.amount), 0)::float AS amount_base
      FROM expenses e
      JOIN payment_journals pj ON pj.id = e.payment_journal_id
      JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.status = 'activo' AND ec.name = :cambio
       ${scoped ? "AND e.company_id = :cid" : ""}
       ${manualWh("e")}
       ${rango(diaManual("e"))}
     GROUP BY day, metodo, pj.currency_id`);

  const otros = await q(`
    SELECT ${diaManual("i")} AS day,
           COUNT(i.id)::int AS tx_count,
           COALESCE(SUM(i.amount * COALESCE(i.rate, 1)), 0)::float AS amount_journal,
           COALESCE(SUM(i.amount), 0)::float AS amount_base,
           COALESCE(SUM(CASE WHEN COALESCE(c.is_base, true) THEN 0 ELSE i.amount * COALESCE(i.rate, 1) END), 0)::float AS amount_local,
           COALESCE(SUM(CASE WHEN COALESCE(c.is_base, true) THEN i.amount ELSE 0 END), 0)::float AS amount_base_cur
      FROM incomes i
      LEFT JOIN payment_journals pj ON pj.id = i.payment_journal_id
      LEFT JOIN currencies c ON c.id = pj.currency_id
     WHERE i.status = 'activo'
       ${scoped ? "AND i.company_id = :cid" : ""}
       ${manualWh("i")}
       ${rango(diaManual("i"))}
     GROUP BY day`);

  // ── Egresos: uno por uno, salvo el vuelto ──────────────────────────────────────────────
  // El pago a un proveedor deja su egreso con reference `purchase_payment:<id>` (o
  // `purchase_batch:<lote>` si un mismo pago cubrió varias compras): por ahí se llega a la
  // compra, a su proveedor (RIF) y a su documento.
  const egresos = await q(`
    WITH ex AS (
      SELECT e.id, ${diaManual("e")} AS day, e.created_at, e.description, e.reference, e.notes,
             e.amount::float AS amount_base, COALESCE(e.rate, 1)::float AS rate,
             (e.amount * COALESCE(e.rate, 1))::float AS amount_journal,
             ${metodo("e")} AS metodo, pj.name AS journal_name, pj.currency_id, e.payment_journal_id,
             (ec.name = :compra) AS es_compra,
             b.name AS bank_name, ec.name AS category_name, e.company_id,
             CASE WHEN e.reference LIKE 'purchase_payment:%'
                  THEN NULLIF(substring(e.reference FROM 18), '')::int END AS pp_id,
             CASE WHEN e.reference LIKE 'purchase_batch:%'
                  THEN substring(e.reference FROM 16) END AS pp_batch
        FROM expenses e
        JOIN expense_categories ec ON ec.id = e.category_id
        LEFT JOIN payment_journals pj ON pj.id = e.payment_journal_id
        LEFT JOIN banks b ON b.id = pj.bank_id
       WHERE e.status = 'activo' AND ec.name <> :cambio
         ${scoped ? "AND e.company_id = :cid" : ""}
         ${manualWh("e")}
         ${rango(diaManual("e"))}
    )
    SELECT ex.*,
           COALESCE(compra.supplier_name,  resp.supplier_name)  AS supplier_name,
           COALESCE(compra.supplier_rif,   resp.supplier_rif)   AS supplier_rif,
           COALESCE(compra.purchase_notes, resp.purchase_notes) AS purchase_notes,
           COALESCE(compra.purchase_ids,   resp.purchase_ids)   AS purchase_ids
      FROM ex
      LEFT JOIN LATERAL (
        SELECT string_agg(DISTINCT COALESCE(pu.supplier_name, cu.name), ', ') AS supplier_name,
               string_agg(DISTINCT cu.rif, ', ')                            AS supplier_rif,
               string_agg(NULLIF(trim(pu.notes), ''), ' · ' ORDER BY pu.id) AS purchase_notes,
               string_agg(pu.id::text, ',' ORDER BY pu.id)                  AS purchase_ids
          FROM purchase_payments pp
          JOIN purchases pu ON pu.id = pp.purchase_id
          LEFT JOIN customers cu ON cu.id = pu.supplier_id
         WHERE pp.company_id IS NOT DISTINCT FROM ex.company_id
           AND ((ex.pp_id IS NOT NULL AND pp.id = ex.pp_id
                 AND pp.payment_journal_id IS NOT DISTINCT FROM ex.payment_journal_id)
             OR (ex.pp_batch IS NOT NULL AND pp.batch_id = ex.pp_batch))
      ) compra ON ex.es_compra
      -- Respaldo: los egresos de la empresa fusionada desde otro servidor (La Concha,
      -- 03-10-2026) conservan en "reference" el id VIEJO del pago, que al renumerar dejó de
      -- existir o es otro. Ahí el pago se reconoce por lo que no cambia: misma empresa, misma
      -- caja, mismo día y el monto (el del pago es el del egreso, o menos si hubo sobrepago).
      LEFT JOIN LATERAL (
        SELECT COALESCE(pu.supplier_name, cu.name) AS supplier_name, cu.rif AS supplier_rif,
               NULLIF(trim(pu.notes), '') AS purchase_notes, pu.id::text AS purchase_ids
          FROM purchase_payments pp
          JOIN purchases pu ON pu.id = pp.purchase_id
          LEFT JOIN customers cu ON cu.id = pu.supplier_id
         WHERE pp.company_id IS NOT DISTINCT FROM ex.company_id
           AND pp.payment_journal_id IS NOT DISTINCT FROM ex.payment_journal_id
           AND pp.reference_date = ex.day
           AND pp.amount <= ex.amount_base + 0.01
         ORDER BY abs(ex.amount_base - pp.amount), pp.id
         LIMIT 1
      ) resp ON ex.es_compra AND compra.purchase_ids IS NULL
     ORDER BY ex.day ASC, ex.created_at ASC, ex.id ASC`);

  // ── Catálogos: monedas y nombres de los métodos ────────────────────────────────────────
  const currencyIds = [...new Set([...cobros, ...vueltos, ...egresos].map(r => r.currency_id).filter(Boolean))];
  const monedas = await q(`
    SELECT id, symbol, code, is_base FROM currencies
     WHERE (${currencyIds.length ? `id IN (${currencyIds.map(Number).filter(Number.isInteger).join(",")}) OR ` : ""} is_base = true)
       ${scoped ? "AND (company_id = :cid OR company_id IS NULL)" : ""}`);
  const monedaDe = (id) => monedas.find(c => c.id === id) || monedas.find(c => c.is_base) || { symbol: "Ref.", is_base: true };
  const base = monedas.find(c => c.is_base) || { symbol: "Ref.", is_base: true };

  const catalogo = await q(`SELECT code, name, sort_order FROM payment_methods ${scoped ? "WHERE company_id = :cid" : ""} ORDER BY sort_order, id`);
  const nombreMetodo = (code) => catalogo.find(m => m.code === code)?.name
    || (code ? code.replace(/_/g, " ").replace(/^\w/, ch => ch.toUpperCase()) : "Sin método");

  // ── Matriz de ingresos ─────────────────────────────────────────────────────────────────
  const keyOf = (r) => `${r.metodo || ""}|${r.currency_id || ""}`;
  const colMap = new Map();
  const addCol = (r) => {
    const k = keyOf(r);
    if (!colMap.has(k)) {
      const cur = monedaDe(r.currency_id);
      colMap.set(k, { id: k, method_code: r.metodo || null, method_name: nombreMetodo(r.metodo), currency_symbol: cur.symbol, is_base: !!cur.is_base });
    }
  };
  cobros.forEach(addCol);
  vueltos.forEach(addCol);
  // El mismo método en dos monedas (efectivo en Bs y en divisas) se nombra con la moneda.
  const porMetodo = {};
  for (const c of colMap.values()) porMetodo[c.method_code] = (porMetodo[c.method_code] || 0) + 1;
  for (const c of colMap.values()) {
    c.label = porMetodo[c.method_code] > 1 || c.method_code === "efectivo"
      ? `${c.method_name} ${c.is_base ? "$" : c.currency_symbol}`.trim()
      : c.method_name;
  }
  // Primero lo que entra en moneda local (Bs), después las divisas; dentro, en el orden del
  // catálogo de métodos de la empresa.
  const orden = (code) => { const i = catalogo.findIndex(m => m.code === code); return i < 0 ? 999 : i; };
  const columns = [...colMap.values()].sort((a, b) =>
    (a.is_base - b.is_base) || (orden(a.method_code) - orden(b.method_code)) || a.label.localeCompare(b.label));

  const dayKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  const days = new Map();
  const dia = (d) => {
    const k = dayKey(d);
    if (!days.has(k)) days.set(k, { date: k, rate: null, cells: {}, other: { amount_journal: 0, amount_base: 0, amount_local: 0, amount_base_cur: 0, tx_count: 0 }, tx_count: 0 });
    return days.get(k);
  };
  const celda = (d, k) => d.cells[k] || (d.cells[k] = { amount_journal: 0, amount_base: 0, tx_count: 0, change_journal: 0, change_base: 0 });

  for (const r of cobros) {
    const c = celda(dia(r.day), keyOf(r));
    c.amount_journal += r.amount_journal; c.amount_base += r.amount_base; c.tx_count += r.tx_count;
    dia(r.day).tx_count += r.tx_count;
  }
  for (const r of vueltos) {
    const c = celda(dia(r.day), keyOf(r));
    c.amount_journal -= r.amount_journal; c.amount_base -= r.amount_base;
    c.change_journal += r.amount_journal; c.change_base += r.amount_base;
  }
  for (const r of otros) Object.assign(dia(r.day).other, r);
  for (const r of tasas) dia(r.day).rate = r.rate;

  // Totales por día. En moneda base suma todo; en Bs, lo que entró en Bs más las divisas
  // convertidas a la tasa del día (así lo lleva la hoja, y así total Bs ÷ tasa ≈ total Ref.).
  const isLocal = (k) => !colMap.get(k)?.is_base;
  const lista = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  let ultimaTasa = null;
  for (const d of lista) {
    // Un día sin cobros en Bs no tiene tasa propia: hereda la del día anterior y lo dice.
    if (d.rate) ultimaTasa = d.rate;
    else { d.rate = ultimaTasa; d.rate_inferred = !!ultimaTasa; }
    let local = 0, baseCur = 0, totalBase = 0;
    for (const [k, c] of Object.entries(d.cells)) {
      totalBase += c.amount_base;
      if (isLocal(k)) local += c.amount_journal; else baseCur += c.amount_base;
    }
    totalBase += d.other.amount_base;
    local += d.other.amount_local; baseCur += d.other.amount_base_cur;
    d.total_base = totalBase;
    d.total_local = local + (d.rate ? baseCur * d.rate : 0);
  }

  const totals = { cells: {}, other: { amount_journal: 0, amount_base: 0, amount_local: 0, tx_count: 0 }, total_base: 0, total_local: 0, change_base: 0, tx_count: 0 };
  for (const d of lista) {
    for (const [k, c] of Object.entries(d.cells)) {
      const t = totals.cells[k] || (totals.cells[k] = { amount_journal: 0, amount_base: 0, tx_count: 0, change_journal: 0, change_base: 0 });
      t.amount_journal += c.amount_journal; t.amount_base += c.amount_base; t.tx_count += c.tx_count;
      t.change_journal += c.change_journal; t.change_base += c.change_base;
      totals.change_base += c.change_base;
    }
    totals.other.amount_base += d.other.amount_base;
    totals.other.amount_local += d.other.amount_local;
    totals.other.tx_count += d.other.tx_count;
    totals.total_base += d.total_base;
    totals.total_local += d.total_local;
    totals.tx_count += d.tx_count;
  }

  // ── Lista de egresos ───────────────────────────────────────────────────────────────────
  const totalEgresos = egresos.reduce((a, e) => a + e.amount_base, 0);
  const tipoDe = (cat) => cat === COMPRA ? "compra" : cat === DEVOLUCION ? "devolucion" : "gasto";
  const expenses = egresos.map(e => {
    const tipo = tipoDe(e.category_name);
    const cur = monedaDe(e.currency_id);
    const docs = tipo === "compra" ? parseDocument(e.purchase_notes) : parseDocument(e.reference);
    return {
      id: e.id,
      date: dayKey(e.day),
      kind: tipo,
      category_name: e.category_name,
      description: tipo === "compra" ? (e.supplier_name || e.description) : e.description,
      rif: tipo === "compra" ? (e.supplier_rif || null) : null,
      purchase_ids: e.purchase_ids ? e.purchase_ids.split(",").map(Number) : [],
      ...docs,
      currency_symbol: cur.symbol,
      is_base: !!cur.is_base,
      amount_journal: e.amount_journal,
      amount_base: e.amount_base,
      rate: e.rate,
      method_code: e.metodo || null,
      method_name: e.metodo ? nombreMetodo(e.metodo) : null,
      journal_name: e.journal_name || null,
      bank_name: e.bank_name || null,
      share: totalEgresos > 0 ? e.amount_base / totalEgresos : 0,
      notes: e.notes || null,
    };
  });

  // Egresos por forma de pago (la cabecera de la hoja de egresos) y por tipo.
  const egresosPorMetodo = new Map();
  for (const e of expenses) {
    const k = `${e.method_code || ""}|${e.currency_symbol}`;
    const t = egresosPorMetodo.get(k) || { id: k, method_name: e.method_name || "Sin caja", currency_symbol: e.currency_symbol, is_base: e.is_base, amount_journal: 0, amount_base: 0, count: 0 };
    t.amount_journal += e.amount_journal; t.amount_base += e.amount_base; t.count += 1;
    egresosPorMetodo.set(k, t);
  }
  const egresosPorTipo = {};
  for (const e of expenses) {
    const t = egresosPorTipo[e.kind] || (egresosPorTipo[e.kind] = { amount_base: 0, count: 0 });
    t.amount_base += e.amount_base; t.count += 1;
  }

  return {
    base_symbol: base.symbol,
    local_symbol: (monedas.find(c => !c.is_base) || {}).symbol || "Bs.",
    summary: {
      income_base: totals.total_base,
      income_local: totals.total_local,
      expense_base: totalEgresos,
      net_base: totals.total_base - totalEgresos,
      expense_ratio: totals.total_base > 0 ? totalEgresos / totals.total_base : null,
      // Bs por cada Ref. de ingreso: la "tasa promedio" del período (en la hoja, "% de rep.").
      avg_rate: totals.total_base > 0 && totals.total_local > 0 ? totals.total_local / totals.total_base : null,
      change_base: totals.change_base,
    },
    income: { columns, days: lista, totals },
    expenses: {
      rows: expenses,
      by_method: [...egresosPorMetodo.values()].sort((a, b) => b.amount_base - a.amount_base),
      by_kind: egresosPorTipo,
    },
  };
}

financeReport.parseDocument = parseDocument;
module.exports = financeReport;
