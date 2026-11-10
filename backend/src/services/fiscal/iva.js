// IVA, fase 1 (05-11-2026). Los precios INCLUYEN el IVA (decisión del usuario): el impuesto no
// cambia ningún monto del sistema —carrito, cobro, tasa de divisas, N/C, arqueo—, solo dice cómo
// se desglosa el total de una factura.
//
//  - Cada producto tiene su alícuota (products.iva_tipo).
//  - Cada línea de venta la congela al nacer (sale_items.iva_rate), igual que el costo: si mañana
//    el producto pasa a exento, las facturas de hoy siguen diciendo 16 %. La pone el hook de
//    abajo, así que los ocho caminos que crean líneas (caja, cuentas en espera, cotizaciones,
//    cambios, pedidos web, mesas, Fábrica…) no tienen que acordarse.
//  - El desglose sigue la regla de la imprenta digital (The Factory HKA, la misma del puente Fact
//    Digital y de gme_facturacion_digital en Odoo 19): POR LÍNEA, base a céntimos e IVA =
//    redondeo(base × alícuota / 100), y el total es la suma de las dos. Como aquí el precio ya trae
//    el IVA, la base de cada línea se saca hacia atrás de lo que se cobró en ella, y los céntimos que
//    el redondeo no deja cuadrar se mueven a otra línea (ver desglose). Así el papel, el libro y lo
//    que HKA emita dan la misma cifra.
//
// Espejo en frontend/src/helpers/iva.js: los dos tienen que dar el mismo céntimo.

// G general, R reducida, A general más la adicional de bienes de lujo, E exento.
const ALICUOTAS = { G: 16, R: 8, A: 31, E: 0 };
const tasaDeTipo = (tipo) => ALICUOTAS[tipo] ?? ALICUOTAS.G;

// Redondeo de HKA (tfhka/dinero.redondear2): mitad hacia arriba sobre el decimal que se ve, no sobre
// el binario. 0.5 × 31 / 100 es 0,155 y tiene que dar 0,16; Math.round(15.4999…) daría 0,15.
function R(valor) {
  const n = Number(valor) || 0;
  const s = String(Math.abs(n));
  if (/e/i.test(s)) return Math.round(n * 100) / 100;
  const [entero, decimales = ""] = s.split(".");
  let centimos = Number(entero) * 100 + Number((decimales + "00").slice(0, 2));
  if ((decimales[2] || "0") >= "5") centimos += 1;
  return (n < 0 ? -centimos : centimos) / 100;
}

// Total de una línea como lo calcula HKA: precioItem + redondeo(precioItem × alícuota / 100).
const totalLinea = (base, tasa) => R(base + R(base * tasa / 100));

// Reparte `monto` en proporción a `bases`; el residuo va a la mayor (tfhka/dinero.repartir_proporcional).
function repartir(monto, bases) {
  const suma = bases.reduce((a, b) => a + b, 0);
  if (!monto || suma <= 0) return bases.map(() => 0);
  const partes = bases.map(b => R(monto * b / suma));
  const residuo = R(monto - partes.reduce((a, p) => a + p, 0));
  if (residuo) {
    const mayor = bases.indexOf(Math.max(...bases));
    partes[mayor] = R(partes[mayor] + residuo);
  }
  return partes;
}

/**
 * Desglose de un total entre sus alícuotas, línea por línea como HKA.
 *
 * `lineas`: [{ monto, tasa }], con el neto de cada línea tal como se imprime. `total`: el total
 * impreso, con el descuento y el recargo de cabecera ya aplicados; se reparte entre las líneas en
 * proporción, igual que HKA reparte el descuento global. Una línea sin tasa en una factura que sí la
 * tiene (una cuenta abierta antes de encender el IVA) va a la general: ante la duda, el impuesto
 * completo.
 *
 * Con el IVA encima y redondeado por línea, hay totales que una línea sola no puede dar: a 16 %, una
 * base de 0,90 da 1,04 y una de 0,91 da 1,06; 1,05 no existe. Ese céntimo se pasa a otra línea (una
 * exenta siempre puede tomarlo). Si la factura tiene una sola línea gravada con un total así, no hay
 * dónde ponerlo: `ajuste` dice cuánto difiere lo fiscal de lo cobrado (un céntimo; HKA lo admite en
 * los pagos, que tolera hasta 0,05).
 *
 * Devuelve null si ninguna línea tiene tasa: la factura es de antes del IVA o de una empresa sin él.
 */
function desglose(lineas, total) {
  if (!lineas?.some(l => l.tasa != null && l.tasa !== "")) return null;
  const T = R(total);
  const ls = lineas.map(l => ({
    tasa: l.tasa == null || l.tasa === "" ? ALICUOTAS.G : parseFloat(l.tasa),
    monto: Math.max(0, parseFloat(l.monto) || 0),
  }));

  // Cada línea se lleva su parte del total impreso y de ahí sale su base hacia atrás.
  const objetivo = repartir(T, ls.map(l => l.monto));
  ls.forEach((l, i) => {
    l.base = l.tasa > 0 ? R(objetivo[i] / (1 + l.tasa / 100)) : objetivo[i];
    l.total = totalLinea(l.base, l.tasa);
  });

  // Céntimos que el redondeo no dejó cuadrar: se mueve la base de la línea que pueda absorberlos
  // de a uno; si ninguna, una que salte dos y otra que devuelva uno. Primero las gravadas, de más
  // peso a menos: una exenta solo si no queda otra, para que el exento quede en su monto exacto.
  const orden = ls.map((_, i) => i)
    .sort((a, b) => (ls[a].tasa > 0 ? 0 : 1) - (ls[b].tasa > 0 ? 0 : 1) || objetivo[b] - objetivo[a]);
  const delta = (i, paso) => R(totalLinea(R(ls[i].base + paso), ls[i].tasa) - ls[i].total);
  const mover = (i, paso) => {
    ls[i].base = R(ls[i].base + paso);
    ls[i].total = totalLinea(ls[i].base, ls[i].tasa);
  };
  const posible = (i, paso) => R(ls[i].base + paso) >= 0;
  let D = R(T - ls.reduce((a, l) => a + l.total, 0));
  for (let vuelta = 0; D !== 0 && vuelta < ls.length * 4 + 4; vuelta++) {
    const paso = D > 0 ? 0.01 : -0.01;
    const uno = orden.find(i => posible(i, paso) && delta(i, paso) === paso);
    if (uno !== undefined) { mover(uno, paso); D = R(D - paso); continue; }
    let par = null;
    for (const a of orden) {
      if (!posible(a, paso) || delta(a, paso) !== R(2 * paso)) continue;
      const b = orden.find(j => j !== a && posible(j, -paso) && delta(j, -paso) === -paso);
      if (b !== undefined) { par = [a, b]; break; }
    }
    if (!par) break;
    mover(par[0], paso);
    mover(par[1], -paso);
    D = R(D - paso);
  }

  const porTasa = new Map();
  for (const l of ls) {
    l.iva = R(l.total - l.base);
    const g = porTasa.get(l.tasa) || { tasa: l.tasa, base: 0, iva: 0 };
    g.base = R(g.base + l.base);
    g.iva = R(g.iva + l.iva);
    porTasa.set(l.tasa, g);
  }
  const grupos = [...porTasa.values()]
    .map(g => ({ ...g, total: R(g.base + g.iva) }))
    .sort((a, b) => b.tasa - a.tasa);
  const gravados = grupos.filter(g => g.tasa > 0);
  const fiscal = R(grupos.reduce((a, g) => a + g.total, 0));
  return {
    grupos,
    lineas: ls.map(({ tasa, base, iva, total: t }) => ({ tasa, base, iva, total: t })),
    exento: R(grupos.filter(g => g.tasa === 0).reduce((a, g) => a + g.total, 0)),
    base: R(gravados.reduce((a, g) => a + g.base, 0)),
    iva: R(gravados.reduce((a, g) => a + g.iva, 0)),
    total: fiscal,
    // Lo fiscal menos lo cobrado: 0 salvo el caso sin solución de arriba.
    ajuste: R(fiscal - T),
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
