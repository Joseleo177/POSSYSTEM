'use strict';

/**
 * Cómo entrega y cómo cobra la tienda los pedidos del catálogo (Configuración → Pedidos web).
 *
 *   · Entrega: retiro en tienda y/o delivery. El delivery se cobra por DISTANCIA desde la
 *     sucursal hasta el punto que marca el cliente: base + por km, con un mínimo y un radio
 *     máximo. Su precio entra a la venta como recargo, igual que el de la caja.
 *   · Pago: qué métodos de cada cuenta se publican (pago móvil del BDV, Zelle…) y con qué datos.
 *     El diario sigue siendo la cuenta; aquí solo se marca cuáles de sus métodos ve el cliente.
 *   · "Pagar al recibir": si el cliente puede enviar el pedido sin reportar un pago.
 *
 * La distancia es la línea recta por un factor que aproxima las vueltas de las calles: sin
 * servicios externos ni claves, instantánea. Si un caso queda corto, la tienda ajusta el monto
 * en el módulo Pedidos antes de aceptar. (Decisión del usuario, 30-10-2026: las zonas con
 * precio fijo se reemplazaron por esto.)
 *
 * Todo arranca apagado salvo el retiro y el pago al recibir: una tienda que no toca esta pantalla
 * sigue recibiendo pedidos como antes.
 */

const { sequelize, Sequelize, Setting, PaymentJournalMethod, Warehouse } = require("../models");
const { opcionesDePago, limpiarInfo } = require("./paymentReports");

const QT = Sequelize.QueryTypes;
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

const KEYS = {
  pickup: "catalog_pickup_enabled",
  delivery: "catalog_delivery_enabled",
  pay_later: "catalog_pay_later",
};
// Lo que vale cada interruptor cuando la empresa nunca lo tocó.
const DEFAULTS = { pickup: true, delivery: false, pay_later: true };

// Tarifa del delivery, en moneda base. max_km 0 = sin límite.
const TARIFA = {
  base: "catalog_delivery_base",
  per_km: "catalog_delivery_per_km",
  min: "catalog_delivery_min",
  max_km: "catalog_delivery_max_km",
};
// Cuánto más largo es ir por las calles que la línea recta, en promedio en ciudad.
const FACTOR_CALLES = 1.3;

async function leerAjustes(companyId, transaction) {
  const rows = await sequelize.query(
    `SELECT key, value FROM settings WHERE company_id = :cid AND key IN (:keys)`,
    { replacements: { cid: companyId, keys: [...Object.values(KEYS), ...Object.values(TARIFA)] }, type: QT.SELECT, transaction },
  );
  const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const out = {};
  for (const [k, key] of Object.entries(KEYS)) out[k] = byKey[key] == null ? DEFAULTS[k] : byKey[key] === "true";
  // Sin ninguna forma de entrega el pedido no se podría enviar: el retiro vuelve solo.
  if (!out.pickup && !out.delivery) out.pickup = true;
  out.tarifa = Object.fromEntries(Object.entries(TARIFA).map(([k, key]) => [k, Math.max(0, r2(byKey[key]))]));
  return out;
}

// Distancia en km entre dos puntos (fórmula del haversine).
function kmEntre(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const puntoValido = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng);

// La sucursal desde la que sale el delivery: la elegida, si tiene su ubicación marcada. Sin
// sucursal elegida (empresa sin tiendas de venta), la primera que la tenga.
async function sucursalDelivery(companyId, warehouseId, transaction) {
  const rows = await sequelize.query(`
    SELECT id, name, lat, lng FROM warehouses
     WHERE company_id = :cid AND active AND sells AND lat IS NOT NULL AND lng IS NOT NULL
       ${warehouseId ? "AND id = :wid" : ""}
     ORDER BY sort_order, name LIMIT 1
  `, { replacements: { cid: companyId, wid: warehouseId || null }, type: QT.SELECT, transaction });
  const w = rows[0];
  return w ? { id: w.id, name: w.name, lat: parseFloat(w.lat), lng: parseFloat(w.lng) } : null;
}

/**
 * Lo que cuesta llevar el pedido de la sucursal al punto. Siempre lo calcula el servidor: lo
 * que diga el navegador es solo una vista previa. { ok, km, fee, reason }.
 */
async function calcularDelivery({ companyId, warehouseId, lat, lng, ajustes = null }, transaction) {
  const la = parseFloat(lat), ln = parseFloat(lng);
  if (!puntoValido(la, ln)) return { ok: false, reason: "Marca en el mapa dónde entregamos el pedido." };
  const tienda = await sucursalDelivery(companyId, warehouseId, transaction);
  if (!tienda) return { ok: false, reason: "Esta tienda todavía no hace delivery desde esta sucursal." };
  const { tarifa } = ajustes || await leerAjustes(companyId, transaction);
  const km = Math.round(kmEntre(tienda, { lat: la, lng: ln }) * FACTOR_CALLES * 10) / 10;
  if (tarifa.max_km > 0 && km > tarifa.max_km) {
    return { ok: false, km, reason: `Ese punto queda a ${km.toFixed(1).replace(".", ",")} km: llevamos hasta ${String(tarifa.max_km).replace(".", ",")} km.` };
  }
  const fee = r2(Math.max(tarifa.min, tarifa.base + km * tarifa.per_km));
  return { ok: true, km, fee, from: tienda.name };
}

// ¿La empresa tiene el extra? Lo enciende el superusuario (Gestión de Empresas) y va con el
// catálogo: no es para todas las tiendas.
async function moduloActivo(companyId, transaction) {
  const [c] = await sequelize.query(
    `SELECT pedidos_web_enabled AND catalog_enabled AS on FROM companies WHERE id = :cid`,
    { replacements: { cid: companyId }, type: QT.SELECT, transaction },
  );
  return !!c?.on;
}

// Lo que ve el catálogo de una empresa sin el extra: el carrito envía directo, como siempre.
const APAGADO = { enabled: false, pickup: true, delivery: false, pay_later: true, delivery_rate: null, payment_options: [] };

/**
 * Lo que el catálogo necesita para armar el paso de entrega y pago. `enabled` = hay algo que
 * preguntar; si no, el carrito envía el pedido directo como siempre. El delivery solo se ofrece
 * si la sucursal tiene su ubicación marcada: sin ella no hay desde dónde medir.
 */
async function configPublica(companyId, warehouseId = null, transaction) {
  if (!(await moduloActivo(companyId, transaction))) return APAGADO;
  const ajustes = await leerAjustes(companyId, transaction);
  const [tienda, opciones] = await Promise.all([
    ajustes.delivery ? sucursalDelivery(companyId, warehouseId, transaction) : null,
    opcionesDePago(companyId, warehouseId, transaction),
  ]);
  const delivery = ajustes.delivery && !!tienda;
  const pickup = ajustes.pickup || !delivery;
  return {
    enabled: delivery || opciones.length > 0,
    pickup,
    delivery,
    // Sin métodos publicados no hay cómo pagar en línea: el pedido se paga al recibir.
    pay_later: ajustes.pay_later || opciones.length === 0,
    // Para que el cliente vea "desde Ref. X"; el monto de su punto lo da /delivery-quote.
    delivery_rate: delivery ? { ...ajustes.tarifa, from: tienda.name } : null,
    payment_options: opciones,
  };
}

// ── Pantalla de configuración ────────────────────────────────────────────

const companyOf = (req) => {
  const c = req.employee?.company_id ?? null;
  if (!c) throw fail("Elige una empresa");
  return parseInt(c, 10);
};

// Cuentas con sus métodos de cobro. El efectivo no se reporta: se paga al recibir.
async function cuentas(companyId) {
  const rows = await sequelize.query(`
    SELECT pj.id AS journal_id, pj.name AS journal_name, pj.account_number,
           b.name AS bank_name, c.code AS currency_code, c.symbol AS currency_symbol,
           m.method_code, m.catalog_visible, m.catalog_info, COALESCE(pm.name, m.method_code) AS method_name,
           (SELECT string_agg(w.name, ', ' ORDER BY w.name) FROM payment_journal_warehouses pjw
              JOIN warehouses w ON w.id = pjw.warehouse_id WHERE pjw.journal_id = pj.id) AS warehouses
      FROM payment_journals pj
      JOIN payment_journal_methods m ON m.journal_id = pj.id AND m.allows_inflow
      LEFT JOIN banks b ON b.id = pj.bank_id
      LEFT JOIN currencies c ON c.id = pj.currency_id
      LEFT JOIN payment_methods pm ON pm.code = m.method_code AND pm.company_id = pj.company_id
     WHERE pj.company_id = :cid AND pj.active AND pj.merged_into_id IS NULL
       AND m.method_code <> 'efectivo'
     ORDER BY pj.sort_order, pj.id, m.sort_order
  `, { replacements: { cid: companyId }, type: QT.SELECT });

  const porCuenta = new Map();
  for (const r of rows) {
    if (!porCuenta.has(r.journal_id)) {
      porCuenta.set(r.journal_id, {
        journal_id: r.journal_id, name: r.journal_name, account_number: r.account_number || null,
        bank_name: r.bank_name || null, currency_code: r.currency_code || null, currency_symbol: r.currency_symbol || "Ref.",
        warehouses: r.warehouses || null, methods: [],
      });
    }
    porCuenta.get(r.journal_id).methods.push({
      method_code: r.method_code, method_name: r.method_name,
      catalog_visible: !!r.catalog_visible, catalog_info: limpiarInfo(r.catalog_info),
    });
  }
  return [...porCuenta.values()];
}

async function sucursales(companyId) {
  const rows = await sequelize.query(`
    SELECT id, name, lat, lng FROM warehouses
     WHERE company_id = :cid AND active AND sells ORDER BY sort_order, name
  `, { replacements: { cid: companyId }, type: QT.SELECT });
  return rows.map(w => ({ id: w.id, name: w.name, lat: w.lat != null ? parseFloat(w.lat) : null, lng: w.lng != null ? parseFloat(w.lng) : null }));
}

async function getConfig(req) {
  const companyId = companyOf(req);
  const [ajustes, warehouses, accounts] = await Promise.all([leerAjustes(companyId), sucursales(companyId), cuentas(companyId)]);
  return { data: { settings: ajustes, warehouses, accounts, street_factor: FACTOR_CALLES } };
}

async function saveSettings(req, body = {}) {
  const companyId = companyOf(req);
  const next = {};
  for (const k of Object.keys(KEYS)) if (body[k] !== undefined) next[k] = !!body[k];
  const actual = await leerAjustes(companyId);
  const final = { ...actual, ...next };
  if (!final.pickup && !final.delivery) throw fail("Deja al menos una forma de entrega: retiro o delivery");
  for (const [k, v] of Object.entries(next)) {
    await Setting.upsert({ key: KEYS[k], value: v ? "true" : "false", company_id: companyId });
  }
  // La tarifa: números en moneda base, nunca negativos.
  if (body.tarifa && typeof body.tarifa === "object") {
    for (const [k, key] of Object.entries(TARIFA)) {
      if (body.tarifa[k] === undefined) continue;
      const n = r2(String(body.tarifa[k] ?? "").replace(",", "."));
      if (n < 0) throw fail("La tarifa no puede tener montos negativos");
      await Setting.upsert({ key, value: String(n), company_id: companyId });
    }
  }
  return { data: await leerAjustes(companyId) };
}

// Ubicación de una sucursal: el punto desde donde se mide el delivery. null la borra.
async function saveWarehouseLocation(req, id, body = {}) {
  const companyId = companyOf(req);
  const w = await Warehouse.findOne({ where: { id: parseInt(id, 10) || 0, company_id: companyId } });
  if (!w) throw fail("Sucursal no encontrada", 404);
  const lat = body.lat === null ? null : parseFloat(body.lat);
  const lng = body.lng === null ? null : parseFloat(body.lng);
  if (lat !== null && !puntoValido(lat, lng)) throw fail("Ubicación inválida");
  await w.update({ lat: lat === null ? null : Math.round(lat * 1e6) / 1e6, lng: lng === null ? null : Math.round(lng * 1e6) / 1e6 });
  return { data: { id: w.id, lat: w.lat != null ? parseFloat(w.lat) : null, lng: w.lng != null ? parseFloat(w.lng) : null } };
}

async function saveMethod(req, journalId, code, body = {}) {
  const companyId = companyOf(req);
  const row = await PaymentJournalMethod.findOne({
    where: { journal_id: parseInt(journalId, 10) || 0, method_code: String(code || ""), company_id: companyId },
  });
  if (!row) throw fail("Ese método no existe en la cuenta", 404);
  if (row.method_code === "efectivo") throw fail("El efectivo se paga al recibir: no se publica");
  if (!row.allows_inflow) throw fail("Ese método no recibe pagos en esta cuenta");
  const patch = {};
  if (body.catalog_visible !== undefined) patch.catalog_visible = !!body.catalog_visible;
  if (body.catalog_info !== undefined) patch.catalog_info = limpiarInfo(body.catalog_info);
  await row.update(patch);
  return { data: { catalog_visible: row.catalog_visible, catalog_info: limpiarInfo(row.catalog_info) } };
}

module.exports = {
  configPublica, moduloActivo, leerAjustes, calcularDelivery, getConfig, saveSettings, saveMethod, saveWarehouseLocation,
  FACTOR_CALLES,
};
