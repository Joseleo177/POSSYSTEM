const { TableOrder, sequelize, Sequelize } = require("../models");
const { assertWarehouseAccess } = require("../middleware/auth");
const { tenantStorage } = require("../utils/tenantStorage");
const { olvidar } = require("../utils/huella");



// Pedidos hechos por el cliente desde el QR de su mesa, del lado del personal. Aceptar uno es
// mandarlo como ronda (tables.sendRound): misma cuenta, mismo inventario, misma comanda que si lo
// hubiera tomado el mesonero. Ver services/mesaPublica.js para el lado del cliente.

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const int = (v) => (Number.isInteger(Number(v)) ? Number(v) : NaN);

/** Pedidos del QR que esperan al mesonero en una sucursal (los muestra el mapa de mesas). */
async function pendientes(companyId, warehouseId, transaction) {
  const filas = await sequelize.query(`
    SELECT o.id, o.table_id, o.summary, o.estimate, o.note, o.created_at
      FROM table_orders o
     WHERE o.company_id = :cid AND o.warehouse_id = :wid AND o.status = 'pendiente'
     ORDER BY o.created_at`,
    { replacements: { cid: companyId, wid: warehouseId }, type: Sequelize.QueryTypes.SELECT, transaction });
  return filas.map(f => ({ ...f, estimate: parseFloat(f.estimate) || 0 }));
}

// Pasa el pedido de 'pendiente' a 'aceptado' en una sola sentencia: si dos mesoneros tocan
// "Aceptar" a la vez, solo uno lo consigue y la ronda no sale dos veces. Si la ronda falla (la
// caja tiene la cuenta abierta, se acabó un plato), vuelve a 'pendiente'.
async function ejecutar(pedido, req, saleId) {
  const [n] = await TableOrder.update(
    { status: "aceptado", resolved_by: req.employee?.id ?? null, resolved_at: new Date() },
    { where: { id: pedido.id, status: "pendiente" } },
  );
  if (!n) throw fail("Ese pedido ya lo atendió otro mesonero", 409);
  try {
    const { sendRound } = require("./tables");
    const nota = ["Pedido desde el QR", pedido.note].filter(Boolean).join(" · ").slice(0, 300);
    const r = await sendRound(req, pedido.table_id, { items: pedido.items, note: nota, ...(saleId ? { sale_id: saleId } : {}) });
    await TableOrder.update({ sale_id: r.data.sale_id, ticket_id: r.data.ticket_id }, { where: { id: pedido.id } });
    return r;
  } catch (e) {
    await TableOrder.update({ status: "pendiente", resolved_by: null, resolved_at: null }, { where: { id: pedido.id } });
    throw e;
  } finally {
    olvidar(`mesas:${pedido.company_id}:`);
    olvidar("mesa:");
  }
}

async function pedidoDe(req, id) {
  const pedido = await TableOrder.findOne({ where: { id: int(id) } });
  if (!pedido) throw fail("Ese pedido ya no existe", 404);
  await assertWarehouseAccess(req, pedido.warehouse_id);
  if (pedido.status !== "pendiente") throw fail("Ese pedido ya lo atendió otro mesonero", 409);
  return pedido;
}

/** El mesonero acepta: sale a cocina como su ronda. body: { sale_id? } si la mesa tiene varias cuentas. */
async function aceptar(req, id, body = {}) {
  const pedido = await pedidoDe(req, id);
  const r = await ejecutar(pedido, req, body.sale_id);
  return { data: { id: pedido.id, ...r.data } };
}

/** El mesonero lo rechaza (broma, mesa equivocada, ya no hay): el cliente ve el motivo. */
async function rechazar(req, id, body = {}) {
  const pedido = await pedidoDe(req, id);
  const reason = String(body.reason || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200) || null;
  const [n] = await TableOrder.update(
    { status: "rechazado", reason, resolved_by: req.employee?.id ?? null, resolved_at: new Date() },
    { where: { id: pedido.id, status: "pendiente" } },
  );
  if (!n) throw fail("Ese pedido ya lo atendió otro mesonero", 409);
  olvidar(`mesas:${pedido.company_id}:`);
  olvidar("mesa:");
  return { data: { id: pedido.id, status: "rechazado" } };
}

/**
 * Modo directo: el pedido sale a cocina en el acto, aceptado por "el sistema" (sin mesonero:
 * waiter_id queda vacío y lo toma quien atienda la mesa). Corre con el tenant de la empresa,
 * como cualquier petición del personal. Si falla, el pedido queda pendiente para el mesonero.
 */
async function aceptarComoSistema(id, companyId) {
  const req = { company_id: companyId, is_superuser: false, employee: { id: null, company_id: companyId, permissions: { all: true } } };
  return tenantStorage.run({ company_id: companyId }, async () => {
    const pedido = await TableOrder.findOne({ where: { id: int(id), status: "pendiente" } });
    if (!pedido) return null;
    try {
      return await ejecutar(pedido, req, null);
    } catch (e) {
      console.error("[pedido QR directo]", e.message);
      return null;
    }
  });
}

module.exports = { pendientes, aceptar, rechazar, aceptarComoSistema };
