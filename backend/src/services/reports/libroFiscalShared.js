const { sequelize, Sequelize } = require("../../models");

// Lo común a los libros de ventas y de compras: las columnas por alícuota, la fila de un documento
// y el resumen del período. Mismas columnas que gme_contabilidad_ve (Odoo 19, libro_fiscal.py).

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// Alícuotas con columna propia en el libro: general, reducida y general + lujo.
const COLUMNAS = [16, 8, 31];

// Columnas de un documento a partir de su desglose (iva.desglose o iva.facturaProveedor).
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

// Ordena los documentos, les pone su N° de operación y suma el resumen del período.
function cerrarLibro(docs) {
  docs.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))
    || new Date(a.created_at) - new Date(b.created_at)
    || (a.tipo === b.tipo ? a.id - b.id : a.tipo < b.tipo ? -1 : 1));
  docs.forEach((d, i) => { d.n = i + 1; });

  const resumen = { total: 0, cobrado: 0, ajuste: 0, retenido: 0, exento: 0, iva_total: 0, gravado: {}, facturas: 0, anuladas: 0, notas: 0, sin_iva: 0 };
  for (const t of COLUMNAS) resumen.gravado[t] = { base: 0, iva: 0 };
  for (const d of docs) {
    if (d.tipo_documento === "NC") resumen.notas++; else resumen.facturas++;
    if (d.anulada) resumen.anuladas++;
    if (d.sin_iva) resumen.sin_iva++;
    resumen.total = r2(resumen.total + d.total);
    resumen.cobrado = r2(resumen.cobrado + (d.cobrado ?? d.total));
    resumen.ajuste = r2(resumen.ajuste + (d.ajuste || 0));
    resumen.retenido = r2(resumen.retenido + (d.retenido || 0));
    resumen.exento = r2(resumen.exento + d.exento);
    resumen.iva_total = r2(resumen.iva_total + d.iva_total);
    for (const [t, g] of Object.entries(d.gravado)) {
      const col = resumen.gravado[t] || (resumen.gravado[t] = { base: 0, iva: 0 });
      col.base = r2(col.base + g.base);
      col.iva = r2(col.iva + g.iva);
    }
  }
  return resumen;
}

// Símbolos de la moneda base y de la local (la del libro) de la empresa.
async function simbolos(company_id) {
  const monedas = await sequelize.query(`
    SELECT symbol, is_base, is_local FROM currencies
     WHERE ${company_id ? "company_id = :cid" : "TRUE"}
     ORDER BY is_base DESC, id`, { replacements: { cid: company_id }, type: Sequelize.QueryTypes.SELECT });
  const base = monedas.find(c => c.is_base);
  const local = monedas.find(c => c.is_local);
  return {
    base_symbol: base?.symbol || "Ref.",
    // Sin moneda local, el libro queda en la base (rate 1 en todos los documentos).
    local_symbol: local?.symbol || base?.symbol || "Bs.",
  };
}

module.exports = { r2, COLUMNAS, fila, cerrarLibro, simbolos };
