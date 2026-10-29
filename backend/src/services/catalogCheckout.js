'use strict';

/**
 * Cómo entrega y cómo cobra la tienda los pedidos del catálogo (Configuración → Pedidos web).
 *
 *   · Entrega: retiro en tienda y/o delivery. El delivery se cobra por zona ("Centro Ref. 2"),
 *     y su precio entra a la venta como recargo, igual que el de la caja.
 *   · Pago: qué métodos de cada cuenta se publican (pago móvil del BDV, Zelle…) y con qué datos.
 *     El diario sigue siendo la cuenta; aquí solo se marca cuáles de sus métodos ve el cliente.
 *   · "Pagar al recibir": si el cliente puede enviar el pedido sin reportar un pago.
 *
 * Todo arranca apagado salvo el retiro y el pago al recibir: una tienda que no toca esta pantalla
 * sigue recibiendo pedidos como antes.
 */

const { sequelize, Sequelize, Setting, DeliveryZone, PaymentJournalMethod, Warehouse } = require("../models");
const { opcionesDePago, limpiarInfo } = require("./paymentReports");

const QT = Sequelize.QueryTypes;
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

const KEYS = {
  pickup: "catalog_pickup_enabled",
  delivery: "catalog_delivery_enabled",
  pay_later: "catalog_pay_later",
};
// Lo que vale cada interruptor cuando la empresa nunca lo tocó.
const DEFAULTS = { pickup: true, delivery: false, pay_later: true };

async function leerAjustes(companyId, transaction) {
  const rows = await sequelize.query(
    `SELECT key, value FROM settings WHERE company_id = :cid AND key IN (:keys)`,
    { replacements: { cid: companyId, keys: Object.values(KEYS) }, type: QT.SELECT, transaction },
  );
  const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const out = {};
  for (const [k, key] of Object.entries(KEYS)) out[k] = byKey[key] == null ? DEFAULTS[k] : byKey[key] === "true";
  // Sin ninguna forma de entrega el pedido no se podría enviar: el retiro vuelve solo.
  if (!out.pickup && !out.delivery) out.pickup = true;
  return out;
}

async function zonasDe(companyId, warehouseId, { soloActivas = true } = {}, transaction) {
  const rows = await sequelize.query(`
    SELECT z.id, z.name, z.price, z.active, z.warehouse_id, z.sort_order, w.name AS warehouse_name
      FROM delivery_zones z
      LEFT JOIN warehouses w ON w.id = z.warehouse_id
     WHERE z.company_id = :cid
       ${soloActivas ? "AND z.active" : ""}
       ${warehouseId === undefined ? "" : "AND (z.warehouse_id IS NULL OR z.warehouse_id = CAST(:wid AS INTEGER))"}
     ORDER BY z.sort_order, z.price, z.name
  `, { replacements: { cid: companyId, wid: warehouseId ?? null }, type: QT.SELECT, transaction });
  return rows.map(z => ({ ...z, price: parseFloat(z.price) }));
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
const APAGADO = { enabled: false, pickup: true, delivery: false, pay_later: true, zones: [], payment_options: [] };

/**
 * Lo que el catálogo necesita para armar el paso de entrega y pago. `enabled` = hay algo que
 * preguntar; si no, el carrito envía el pedido directo como siempre.
 */
async function configPublica(companyId, warehouseId = null, transaction) {
  if (!(await moduloActivo(companyId, transaction))) return APAGADO;
  const ajustes = await leerAjustes(companyId, transaction);
  const [zonas, opciones] = await Promise.all([
    ajustes.delivery ? zonasDe(companyId, warehouseId, {}, transaction) : [],
    opcionesDePago(companyId, warehouseId, transaction),
  ]);
  return {
    enabled: ajustes.delivery || opciones.length > 0,
    pickup: ajustes.pickup,
    delivery: ajustes.delivery,
    // Sin métodos publicados no hay cómo pagar en línea: el pedido se paga al recibir.
    pay_later: ajustes.pay_later || opciones.length === 0,
    zones: zonas.map(z => ({ id: z.id, name: z.name, price: z.price })),
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

async function getConfig(req) {
  const companyId = companyOf(req);
  const [ajustes, zonas, accounts] = await Promise.all([
    leerAjustes(companyId), zonasDe(companyId, undefined, { soloActivas: false }), cuentas(companyId),
  ]);
  return { data: { settings: ajustes, zones: zonas, accounts } };
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
  return { data: final };
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

function leerZona(body = {}) {
  const name = String(body.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (name.length < 2) throw fail("Ponle un nombre a la zona");
  const price = Math.round((parseFloat(String(body.price ?? "").replace(",", ".")) || 0) * 100) / 100;
  if (price < 0) throw fail("El precio no puede ser negativo");
  const out = { name, price };
  if (body.active !== undefined) out.active = !!body.active;
  if (body.warehouse_id !== undefined) out.warehouse_id = parseInt(body.warehouse_id, 10) || null;
  if (body.sort_order !== undefined) out.sort_order = parseInt(body.sort_order, 10) || 0;
  return out;
}

async function assertSucursal(companyId, warehouseId) {
  if (!warehouseId) return;
  const w = await Warehouse.findOne({ where: { id: warehouseId, company_id: companyId }, attributes: ["id"] });
  if (!w) throw fail("Sucursal no encontrada");
}

async function createZone(req, body) {
  const companyId = companyOf(req);
  const datos = leerZona(body);
  await assertSucursal(companyId, datos.warehouse_id);
  const z = await DeliveryZone.create({ ...datos, company_id: companyId });
  return { data: z };
}

async function updateZone(req, id, body) {
  const companyId = companyOf(req);
  const z = await DeliveryZone.findOne({ where: { id: parseInt(id, 10) || 0, company_id: companyId } });
  if (!z) throw fail("Zona no encontrada", 404);
  const datos = leerZona({ ...z.toJSON(), ...body });
  await assertSucursal(companyId, datos.warehouse_id);
  await z.update(datos);
  return { data: z };
}

// Las ventas guardan el id de la zona solo como dato; su nombre y precio ya quedaron en el
// recargo. Borrar una zona no cambia ningún pedido.
async function removeZone(req, id) {
  const companyId = companyOf(req);
  const n = await DeliveryZone.destroy({ where: { id: parseInt(id, 10) || 0, company_id: companyId } });
  if (!n) throw fail("Zona no encontrada", 404);
  return { message: "Zona eliminada" };
}

module.exports = { configPublica, moduloActivo, leerAjustes, zonasDe, getConfig, saveSettings, saveMethod, createZone, updateZone, removeZone };
