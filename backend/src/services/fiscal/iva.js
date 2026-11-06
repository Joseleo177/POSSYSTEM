// IVA, fase 1 (05-11-2026). Los precios INCLUYEN el IVA (decisión del usuario): el impuesto no
// cambia ningún monto del sistema —carrito, cobro, tasa de divisas, N/C, arqueo—, solo dice cómo
// se desglosa el total de una factura.
//
//  - Cada producto tiene su alícuota (products.iva_tipo).
//  - Cada línea de venta la congela al nacer (sale_items.iva_rate), igual que el costo: si mañana
//    el producto pasa a exento, las facturas de hoy siguen diciendo 16 %. La pone el hook de
//    abajo, así que los ocho caminos que crean líneas (caja, cuentas en espera, cotizaciones,
//    cambios, pedidos web, mesas, Fábrica…) no tienen que acordarse.
//  - El desglose se calcula sobre el total que se imprime (desglose): bases más IVA dan ese
//    total al céntimo, en la moneda y con el redondeo que tenga el papel. Los descuentos y
//    recargos de cabecera se reparten entre las alícuotas en proporción a sus líneas.
//
// Espejo en frontend/src/helpers/iva.js: los dos tienen que dar el mismo céntimo.

// G general, R reducida, A general más la adicional de bienes de lujo, E exento.
const ALICUOTAS = { G: 16, R: 8, A: 31, E: 0 };
const tasaDeTipo = (tipo) => ALICUOTAS[tipo] ?? ALICUOTAS.G;

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

/**
 * Desglose de un total entre sus alícuotas.
 *
 * `lineas`: [{ monto, tasa }], con el monto neto de cada línea tal como se imprime. Una línea sin
 * tasa en una factura que sí la tiene (una cuenta abierta antes de encender el IVA) va a la
 * general: ante la duda, el impuesto completo.
 *
 * Devuelve null si ninguna línea tiene tasa: la factura es de antes del IVA o de una empresa sin él.
 */
function desglose(lineas, total) {
  if (!lineas?.some(l => l.tasa != null && l.tasa !== "")) return null;
  const T = r2(total);
  const porTasa = new Map();
  for (const l of lineas) {
    const tasa = l.tasa == null || l.tasa === "" ? ALICUOTAS.G : parseFloat(l.tasa);
    porTasa.set(tasa, (porTasa.get(tasa) || 0) + (parseFloat(l.monto) || 0));
  }
  const suma = [...porTasa.values()].reduce((a, m) => a + m, 0);

  // Cada alícuota se lleva su parte del total; la de más peso, lo que sobre del redondeo.
  const grupos = [...porTasa.entries()]
    .map(([tasa, monto]) => ({ tasa, monto }))
    .sort((a, b) => b.monto - a.monto);
  let repartido = 0;
  for (let i = grupos.length - 1; i >= 1; i--) {
    grupos[i].total = suma > 0 ? r2(T * grupos[i].monto / suma) : 0;
    repartido += grupos[i].total;
  }
  grupos[0].total = r2(T - repartido);

  for (const g of grupos) {
    g.base = g.tasa > 0 ? r2(g.total / (1 + g.tasa / 100)) : g.total;
    g.iva = r2(g.total - g.base);
    delete g.monto;
  }
  grupos.sort((a, b) => b.tasa - a.tasa);

  const gravados = grupos.filter(g => g.tasa > 0);
  return {
    grupos,
    exento: r2(grupos.filter(g => g.tasa === 0).reduce((a, g) => a + g.total, 0)),
    base: r2(gravados.reduce((a, g) => a + g.base, 0)),
    iva: r2(gravados.reduce((a, g) => a + g.iva, 0)),
    total: T,
  };
}

// ── Interruptor por empresa ────────────────────────────────────────────────────────────────
// Se lee al crear cada línea de venta: caché corta para no consultar la empresa por cada una.
// Encenderlo o apagarlo desde Gestión de Empresas la limpia (invalidarIva).
const TTL_MS = 30 * 1000;
const activo = new Map(); // company_id -> { value, expires }
let models = null;

async function ivaActivo(companyId, transaction) {
  if (!companyId || !models) return false;
  const hit = activo.get(companyId);
  if (hit && hit.expires > Date.now()) return hit.value;
  const c = await models.Company.findByPk(companyId, { attributes: ["iva_enabled"], transaction });
  const value = !!c?.iva_enabled;
  activo.set(companyId, { value, expires: Date.now() + TTL_MS });
  return value;
}

function invalidarIva(companyId) {
  activo.delete(parseInt(companyId));
}

// Empresa de cada venta: no cambia nunca, así que se recuerda. Una venta de diez líneas consulta
// una sola vez.
const empresaDeVenta = new Map(); // sale_id -> company_id

async function empresaDe(saleId, transaction) {
  if (empresaDeVenta.has(saleId)) return empresaDeVenta.get(saleId);
  const sale = await models.Sale.findByPk(saleId, { attributes: ["company_id"], transaction });
  const cid = sale?.company_id ?? null;
  if (empresaDeVenta.size > 2000) empresaDeVenta.clear();
  empresaDeVenta.set(saleId, cid);
  return cid;
}

// Congela la alícuota del producto en la línea que nace. Quien ya la trae (una copia de otra
// línea) la conserva.
async function fotoIva(item, options) {
  if (item.get("iva_rate") != null || !item.get("sale_id")) return;
  const transaction = options?.transaction;
  const cid = await empresaDe(item.get("sale_id"), transaction);
  if (!(await ivaActivo(cid, transaction))) return;
  let tipo = "G";
  if (item.get("product_id")) {
    const p = await models.Product.findByPk(item.get("product_id"), { attributes: ["iva_tipo"], transaction });
    if (p?.iva_tipo) tipo = p.iva_tipo;
  }
  item.set("iva_rate", tasaDeTipo(tipo));
  if (options?.fields && !options.fields.includes("iva_rate")) options.fields.push("iva_rate");
}

function installIvaHooks(db) {
  models = db;
  if (db.SaleItem) db.SaleItem.addHook("beforeCreate", "fotoIva", fotoIva);
}

module.exports = { ALICUOTAS, tasaDeTipo, desglose, ivaActivo, invalidarIva, installIvaHooks };
