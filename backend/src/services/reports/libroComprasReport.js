const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate } = require("./shared");
const { facturaProveedor, desglose, redondeoFiscal: R } = require("../fiscal/iva");
const { rifConGuiones } = require("../fiscal/rif");
const { COLUMNAS, fila, cerrarLibro, simbolos } = require("./libroFiscalShared");

// Libro de compras (IVA, etapa 1): una fila por factura de proveedor del período, en bolívares, con
// el total desglosado por alícuota. Mismas columnas que el de ventas y que el de Odoo 19.
//
// Entran:
//  - las compras con factura fiscal (purchases.fiscal), con sus líneas y sus otros cargos;
//  - los gastos con factura (expenses.fiscal) que no estén anulados.
// Las compras sin factura (nota de entrega, compra informal) no entran: no dan crédito fiscal.
//
// Fecha: la de la factura del proveedor, que es la que decide en qué período se toma el crédito.
//
// Moneda: el papel del proveedor manda. Una compra cargada en bolívares se toma tal cual (su tasa y
// su corrección de IVA son las del papel); una cargada en divisas se pasa a bolívares a la tasa del
// día de la factura (historial de tasas), línea por línea, igual que el de Odoo.

async function libroComprasReport({ date_from, date_to, company_id, allowedWarehouses, warehouse_id }) {
  const from = sanitizeDate(date_from);
  const to   = sanitizeDate(date_to);
  if (!from || !to) {
    const e = new Error("Elige el período del libro"); e.status = 400; e.isOperational = true; throw e;
  }

  const wid = warehouse_id ? parseInt(warehouse_id) : null;
  if (wid && Array.isArray(allowedWarehouses) && !allowedWarehouses.includes(wid)) {
    const e = new Error("No tienes acceso a este almacén"); e.status = 403; e.isOperational = true; throw e;
  }
  const whDe = (a) => {
    if (wid) return `AND ${a}.warehouse_id = ${wid}`;
    if (!Array.isArray(allowedWarehouses)) return "";
    const ids = allowedWarehouses.filter(Number.isInteger);
    return ids.length ? `AND ${a}.warehouse_id IN (${ids.join(",")})` : "AND FALSE";
  };

  const scoped = !!company_id;
  const rep = { cid: company_id, dfrom: from, dto: to };
  const q = (sql) => sequelize.query(sql, { replacements: rep, type: Sequelize.QueryTypes.SELECT });

  // Moneda local de la empresa y su tasa en una fecha (la última guardada hasta ese día).
  const tasaDe = (alias, fecha) => `
    LEFT JOIN LATERAL (
      SELECT c.id, c.exchange_rate FROM currencies c
       WHERE c.company_id = ${alias}.company_id AND c.is_local LIMIT 1
    ) loc ON true
    LEFT JOIN LATERAL (
      SELECT cr.rate FROM currency_rates cr
       WHERE cr.company_id = ${alias}.company_id AND cr.currency_id = loc.id AND cr.rate_date <= ${fecha}
       ORDER BY cr.rate_date DESC LIMIT 1
    ) hist ON true`;

  const compras = await q(`
    SELECT p.id, p.created_at, p.supplier_invoice_date::text AS fecha, p.supplier_invoice_number AS numero,
           p.supplier_control_number AS control, p.supplier_rif AS rif,
           COALESCE(NULLIF(s.tax_name, ''), s.name, p.supplier_name) AS nombre,
           p.exchange_rate::float AS rate, p.iva_adjust::float AS ajuste,
           (p.currency_id IS NOT NULL AND p.currency_id = loc.id) AS en_local,
           COALESCE(hist.rate, loc.exchange_rate, 1)::float AS tasa_dia
      FROM purchases p
      LEFT JOIN customers s ON s.id = p.supplier_id
      ${tasaDe("p", "p.supplier_invoice_date")}
     WHERE p.fiscal = true
       ${scoped ? "AND p.company_id = :cid" : ""}
       ${whDe("p")}
       AND p.supplier_invoice_date BETWEEN :dfrom AND :dto`);

  const ids = compras.map(c => c.id);
  const lineas = ids.length ? await q(`
    SELECT purchase_id, subtotal::float AS base, iva_rate::float AS tasa FROM purchase_items WHERE purchase_id IN (${ids.join(",")})
    UNION ALL
    SELECT purchase_id, amount::float AS base, iva_rate::float AS tasa FROM purchase_charges WHERE purchase_id IN (${ids.join(",")})`) : [];
  const lineasDe = new Map();
  for (const l of lineas) {
    if (!lineasDe.has(l.purchase_id)) lineasDe.set(l.purchase_id, []);
    lineasDe.get(l.purchase_id).push(l);
  }

  const gastos = await q(`
    SELECT e.id, e.created_at, e.invoice_date::text AS fecha, e.invoice_number AS numero,
           e.control_number AS control, e.supplier_rif AS rif, e.supplier_name AS nombre,
           e.invoice_total::float AS total, e.iva_amount::float AS iva, e.iva_rate::float AS tasa,
           e.amount::float AS amount, e.rate::float AS rate,
           (e.currency_id IS NOT NULL AND e.currency_id = loc.id) AS en_local,
           COALESCE(hist.rate, loc.exchange_rate, 1)::float AS tasa_dia
      FROM expenses e
      ${tasaDe("e", "e.invoice_date")}
     WHERE e.fiscal = true AND e.status = 'activo'
       ${scoped ? "AND e.company_id = :cid" : ""}
       ${whDe("e")}
       AND e.invoice_date BETWEEN :dfrom AND :dto`);

  const docs = [];
  const base = (d) => ({
    tipo_documento: "FAC",
    transaccion: "01-reg",
    control: d.control || null,
    afectada: null,
    rif: d.rif ? rifConGuiones(d.rif) : null,
    nombre: d.nombre || null,
    anulada: false,
    sin_iva: false,
    retenido: 0,
    created_at: d.created_at,
    fecha: d.fecha,
    numero: d.numero,
  });

  for (const c of compras) {
    // En bolívares, el papel tal cual; en divisas, a la tasa del día de la factura.
    const rate = c.en_local ? (c.rate > 0 ? c.rate : 1) : (c.tasa_dia > 0 ? c.tasa_dia : 1);
    const ajuste = c.en_local ? c.ajuste : R((c.ajuste || 0) * rate / (c.rate > 0 ? c.rate : 1));
    const montos = facturaProveedor(lineasDe.get(c.id) || [], rate, ajuste);
    docs.push({ ...base(c), tipo: "compra", id: c.id, rate, total: montos.total, ajuste: 0, ...fila(montos) });
  }

  for (const g of gastos) {
    // Total e IVA del papel; si el gasto no se pagó en la moneda local, se pasan a la tasa del día.
    const papel = g.total > 0 ? g.total : R(g.amount * (g.rate || 1));
    const factor = g.en_local ? 1 : (g.tasa_dia > 0 ? g.tasa_dia : 1) / (g.rate > 0 ? g.rate : 1);
    const total = R(papel * factor);
    const iva = g.tasa > 0 ? (g.en_local ? R(g.iva) : R(g.iva * factor)) : 0;
    const tasa = g.tasa ?? 16;
    const montos = tasa > 0
      ? { grupos: [{ tasa, base: R(total - iva), iva, total }], exento: 0, iva }
      : desglose([{ monto: total, tasa: 0 }], total);
    docs.push({ ...base(g), tipo: "gasto", id: g.id, rate: g.en_local ? (g.rate || 1) : (g.tasa_dia || 1), total, ajuste: 0, ...fila(montos) });
  }

  const resumen = cerrarLibro(docs);
  return {
    ...(await simbolos(company_id)),
    columnas: COLUMNAS,
    docs,
    resumen,
  };
}

module.exports = libroComprasReport;
