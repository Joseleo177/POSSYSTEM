const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, localDate } = require("./shared");
const { netoLineaEnTasa } = require("../sales/lineDiscount");
const { desglose } = require("../fiscal/iva");

// Libro de ventas (IVA, fase 1): una fila por factura y por nota de crédito del período, en la
// moneda local, con el total desglosado por alícuota. Es lo que el contador pide cada mes.
//
// Moneda: la factura legal va en bolívares, así que cada documento se pasa a la tasa de SU
// fecha, no a la de hoy:
//  - con tasa de divisas, la del sistema con que se facturó (fx_base_rate: la del papel en Bs);
//  - si la caja facturó en bolívares, la de la venta (exchange_rate);
//  - si no, la del historial de tasas para ese día (currency_rates), y sin historial la actual.
// El total en bolívares se arma igual que el papel (precio convertido y redondeado por línea,
// menos el descuento de la caja, más el recargo; ver fxRate.totalEnTasa), y el desglose es el
// mismo de services/fiscal/iva.js: bases más IVA dan ese total al céntimo.
//
// Una factura anulada sigue en el libro con sus montos en cero: el correlativo no puede tener
// huecos. Una emitida antes de encender el IVA sale con `sin_iva` y solo su total.

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// Alícuotas con columna propia en el libro: general, reducida y general + lujo.
const COLUMNAS = [16, 8, 31];

function fila(montos) {
  const out = { exento: 0, gravado: {}, iva_total: 0 };
  for (const t of COLUMNAS) out.gravado[t] = { base: 0, iva: 0 };
  if (!montos) return out;
  out.exento = montos.exento;
  out.iva_total = montos.iva;
  for (const g of montos.grupos) {
    if (g.tasa === 0) continue;
    const col = out.gravado[g.tasa] || (out.gravado[g.tasa] = { base: 0, iva: 0 });
    col.base = r2(col.base + g.base);
    col.iva = r2(col.iva + g.iva);
  }
  return out;
}

async function libroVentasReport({ date_from, date_to, company_id, allowedWarehouses, warehouse_id }) {
  const from = sanitizeDate(date_from);
  const to   = sanitizeDate(date_to);
  if (!from || !to) {
    const e = new Error("Elige el período del libro"); e.status = 400; e.isOperational = true; throw e;
  }

  const wid = warehouse_id ? parseInt(warehouse_id) : null;
  if (wid && Array.isArray(allowedWarehouses) && !allowedWarehouses.includes(wid)) {
    const e = new Error("No tienes acceso a este almacén"); e.status = 403; e.isOperational = true; throw e;
  }
  let whSql = "";
  if (wid) whSql = `AND s.warehouse_id = ${wid}`;
  else if (Array.isArray(allowedWarehouses)) {
    const ids = allowedWarehouses.filter(Number.isInteger);
    whSql = ids.length ? `AND s.warehouse_id IN (${ids.join(",")})` : "AND FALSE";
  }

  const scoped = !!company_id;
  const rep = { cid: company_id, dfrom: from, dto: to };
  const q = (sql) => sequelize.query(sql, { replacements: rep, type: Sequelize.QueryTypes.SELECT });
  const diaVenta = localDate("s.created_at");
  const diaNc = localDate("r.created_at");

  // Tasa de la fecha de cada factura (ver arriba). La moneda local es la marcada como tal en la
  // empresa de la venta (is_local); nunca una tasa alterna como la USDT: el libro va a BCV.
  const tasaSql = `
    LEFT JOIN LATERAL (
      SELECT c.id, c.exchange_rate FROM currencies c
       WHERE c.company_id = s.company_id AND c.is_local LIMIT 1
    ) loc ON true
    LEFT JOIN LATERAL (
      SELECT cr.rate FROM currency_rates cr
       WHERE cr.company_id = s.company_id AND cr.currency_id = loc.id AND cr.rate_date <= ${diaVenta}
       ORDER BY cr.rate_date DESC LIMIT 1
    ) hist ON true`;
  const tasaCol = `COALESCE(
      CASE WHEN s.fx_base_rate > 1 THEN s.fx_base_rate END,
      CASE WHEN s.exchange_rate > 1 THEN s.exchange_rate END,
      hist.rate, loc.exchange_rate, 1)::float`;

  const ventas = await q(`
    SELECT s.id, s.invoice_number, s.status, ${diaVenta} AS day, s.created_at,
           s.total::float AS total_base, s.discount_amount::float AS discount, s.fx_discount::float AS fx_discount,
           s.service_charge::float AS charge, ${tasaCol} AS rate,
           COALESCE(NULLIF(c.tax_name, ''), c.name, s.web_customer_name) AS customer_name, c.rif AS customer_rif
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      ${tasaSql}
     WHERE s.invoice_number IS NOT NULL
       ${scoped ? "AND s.company_id = :cid" : ""}
       ${whSql}
       AND ${diaVenta} BETWEEN :dfrom AND :dto
     ORDER BY s.created_at, s.id`);

  const lineas = ventas.length ? await q(`
    SELECT si.id, si.sale_id, si.price::float AS price, si.discount::float AS discount, si.quantity::float AS quantity,
           si.line_discount_mode, si.line_discount_value::float AS line_discount_value, si.iva_rate::float AS iva_rate
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
     WHERE s.invoice_number IS NOT NULL
       ${scoped ? "AND s.company_id = :cid" : ""}
       ${whSql}
       AND ${diaVenta} BETWEEN :dfrom AND :dto`) : [];
  const lineasDe = new Map();
  for (const l of lineas) {
    if (!lineasDe.has(l.sale_id)) lineasDe.set(l.sale_id, []);
    lineasDe.get(l.sale_id).push(l);
  }

  // Notas de crédito del período, por su propia fecha. Van a la tasa de la factura que afectan:
  // devuelven una parte de ESA factura, con sus mismos bolívares.
  const notas = await q(`
    SELECT r.id, r.nc_number, r.status, ${diaNc} AS day, r.created_at, r.total::float AS total_base,
           s.id AS sale_id, s.invoice_number, ${tasaCol} AS rate,
           COALESCE(NULLIF(c.tax_name, ''), c.name, s.web_customer_name) AS customer_name, c.rif AS customer_rif
      FROM returns r
      JOIN sales s ON s.id = r.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      ${tasaSql}
     WHERE r.nc_number IS NOT NULL
       ${scoped ? "AND r.company_id = :cid" : ""}
       ${whSql}
       AND ${diaNc} BETWEEN :dfrom AND :dto
     ORDER BY r.created_at, r.id`);
  const lineasNc = notas.length ? await q(`
    SELECT ri.return_id, ri.subtotal::float AS subtotal, si.iva_rate::float AS iva_rate
      FROM return_items ri
      JOIN returns r ON r.id = ri.return_id
      JOIN sales s ON s.id = r.sale_id
      LEFT JOIN sale_items si ON si.id = ri.sale_item_id
     WHERE r.nc_number IS NOT NULL
       ${scoped ? "AND r.company_id = :cid" : ""}
       ${whSql}
       AND ${diaNc} BETWEEN :dfrom AND :dto`) : [];
  const lineasDeNc = new Map();
  for (const l of lineasNc) {
    if (!lineasDeNc.has(l.return_id)) lineasDeNc.set(l.return_id, []);
    lineasDeNc.get(l.return_id).push(l);
  }

  const docs = [];

  for (const v of ventas) {
    const anulada = v.status === "anulado";
    const items = lineasDe.get(v.id) || [];
    const rate = v.rate > 0 ? v.rate : 1;
    // Igual que el papel en bolívares: sin la rebaja de divisas (a la tasa del sistema no la hay).
    const manual = Math.max(0, (v.discount || 0) - (v.fx_discount || 0));
    const netos = items.map(l => ({ monto: netoLineaEnTasa(l, rate), tasa: l.iva_rate }));
    const total = r2(netos.reduce((a, l) => a + l.monto, 0) - r2(manual * rate) + r2((v.charge || 0) * rate));
    const montos = anulada ? null : desglose(netos, Math.max(0, total));
    docs.push({
      tipo: "factura",
      id: v.id,
      fecha: v.day,
      created_at: v.created_at,
      numero: v.invoice_number,
      control: null,
      afectada: null,
      rif: v.customer_rif || null,
      nombre: v.customer_name || null,
      rate,
      anulada,
      sin_iva: !anulada && !montos,
      total: anulada ? 0 : Math.max(0, total),
      total_base: anulada ? 0 : r2(v.total_base),
      ...fila(montos),
    });
  }

  for (const n of notas) {
    const anulada = n.status === "anulado";
    const rate = n.rate > 0 ? n.rate : 1;
    const items = lineasDeNc.get(n.id) || [];
    const total = r2(n.total_base * rate);
    const montos = anulada ? null : desglose(items.map(l => ({ monto: l.subtotal * rate, tasa: l.iva_rate })), total);
    const f = fila(montos);
    // La N/C resta: sus montos van en negativo, como en el libro impreso.
    const neg = (x) => (x ? -x : 0);
    docs.push({
      tipo: "nc",
      id: n.id,
      fecha: n.day,
      created_at: n.created_at,
      numero: n.nc_number,
      control: null,
      afectada: n.invoice_number,
      rif: n.customer_rif || null,
      nombre: n.customer_name || null,
      rate,
      anulada,
      sin_iva: !anulada && !montos,
      total: anulada ? 0 : neg(total),
      total_base: anulada ? 0 : neg(r2(n.total_base)),
      exento: neg(f.exento),
      iva_total: neg(f.iva_total),
      gravado: Object.fromEntries(Object.entries(f.gravado).map(([t, g]) => [t, { base: neg(g.base), iva: neg(g.iva) }])),
    });
  }

  docs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || (a.tipo === b.tipo ? a.id - b.id : a.tipo === "factura" ? -1 : 1));

  // Resumen del período: lo que va a la declaración.
  const resumen = { total: 0, exento: 0, iva_total: 0, gravado: {}, facturas: 0, anuladas: 0, notas: 0, sin_iva: 0 };
  for (const t of COLUMNAS) resumen.gravado[t] = { base: 0, iva: 0 };
  for (const d of docs) {
    if (d.tipo === "factura") resumen.facturas++; else resumen.notas++;
    if (d.anulada) resumen.anuladas++;
    if (d.sin_iva) resumen.sin_iva++;
    resumen.total = r2(resumen.total + d.total);
    resumen.exento = r2(resumen.exento + d.exento);
    resumen.iva_total = r2(resumen.iva_total + d.iva_total);
    for (const [t, g] of Object.entries(d.gravado)) {
      const col = resumen.gravado[t] || (resumen.gravado[t] = { base: 0, iva: 0 });
      col.base = r2(col.base + g.base);
      col.iva = r2(col.iva + g.iva);
    }
  }

  const monedas = await q(`
    SELECT symbol, is_base, is_local FROM currencies
     WHERE ${scoped ? "company_id = :cid" : "TRUE"}
     ORDER BY is_base DESC, id`);
  const base = monedas.find(c => c.is_base);
  const local = monedas.find(c => c.is_local);

  return {
    base_symbol: base?.symbol || "Ref.",
    // Sin moneda local, el libro queda en la base (rate 1 en todos los documentos).
    local_symbol: local?.symbol || base?.symbol || "Bs.",
    columnas: COLUMNAS,
    docs,
    resumen,
  };
}

module.exports = libroVentasReport;
