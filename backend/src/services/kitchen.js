const { sequelize, Sequelize, KitchenTicket, KitchenTicketItem, Sale } = require("../models");
const { visibleWarehouseIds, assertWarehouseAccess } = require("../middleware/auth");
const { huella, olvidar } = require("../utils/huella");

// Lo que cambia la cocina cambia también el mapa de mesas y el QR de la mesa.
const olvidarHuellas = (companyId) => { olvidar(`cocina:${companyId}:`); olvidar(`mesas:${companyId}:`); olvidar("mesa:"); };

const QT = Sequelize.QueryTypes;

// Pantalla de cocina. Cada comanda es una ronda (kitchen_tickets): el pedido entero que llega
// del catálogo, o lo que el mesonero suma a una mesa en cada envío. Aquí se crea, se lee el
// tablero y se mueve entre sus estados. No toca inventario, cobro ni la cuenta: eso sigue
// siendo de la caja.
const ESTADOS = ["nueva", "preparando", "lista", "entregada"];

const fail = (message, status) => Object.assign(new Error(message), { status, isOperational: true });

/**
 * Resumen de las comandas de una cuenta en sales.kitchen_status, que es lo que la caja mira
 * ("En cocina" / "Lista") y lo que dispara su aviso. Con una ronda lista ya hay algo que llevar
 * a la mesa, así que "lista" manda sobre las que siguen en preparación.
 */
async function resumirCuenta(saleId, transaction) {
  const rows = await KitchenTicket.findAll({ where: { sale_id: saleId }, attributes: ["status", "ready_at"], transaction });
  if (!rows.length) return;
  const hay = (s) => rows.some(r => r.status === s);
  const status = hay("lista") ? "lista" : hay("preparando") ? "preparando" : hay("nueva") ? "nueva" : "entregada";
  const listas = rows.map(r => r.ready_at).filter(Boolean).map(d => new Date(d).getTime());
  await Sale.update(
    { kitchen_status: status, kitchen_status_at: new Date(), kitchen_ready_at: listas.length ? new Date(Math.max(...listas)) : null },
    { where: { id: saleId }, transaction },
  );
}

/**
 * Manda una ronda a cocina. `items`: [{ product_id, name, quantity, note }]. Va dentro de la
 * transacción de quien la crea (el pedido del catálogo o la ronda del mesonero).
 */
async function crearComanda({ sale, items, label, note, waiterId = null, tableId = null, warehouseId = null }, transaction) {
  const previas = await KitchenTicket.count({ where: { sale_id: sale.id }, transaction });
  const ticket = await KitchenTicket.create({
    company_id: sale.company_id,
    sale_id: sale.id,
    warehouse_id: warehouseId ?? sale.warehouse_id ?? sale.requested_warehouse_id ?? null,
    table_id: tableId ?? sale.table_id ?? null,
    waiter_id: waiterId,
    round_no: previas + 1,
    label: label ? String(label).slice(0, 120) : null,
    note: note ? String(note).trim().slice(0, 300) || null : null,
  }, { transaction });
  await KitchenTicketItem.bulkCreate(items.map(i => ({
    ticket_id: ticket.id,
    product_id: i.product_id ?? null,
    name: String(i.name).slice(0, 255),
    quantity: i.quantity,
    note: i.note ? String(i.note).trim().slice(0, 200) || null : null,
    modifiers: i.modifiers ? String(i.modifiers).slice(0, 400) : null,
  })), { transaction });
  await resumirCuenta(sale.id, transaction);
  olvidarHuellas(sale.company_id);
  return ticket;
}

/**
 * Comandas vivas del tablero, en una sola consulta: cada pantalla la repite cada pocos
 * segundos y la base de Supabase tiene un pool de 2 conexiones (ver índice
 * kitchen_tickets_activas).
 *
 * - Lo de hace más de 18 horas no se muestra: una comanda que nadie cerró ayer no debe quedar
 *   para siempre arriba del tablero.
 * - Las listas desaparecen solas a las 2 horas aunque nadie las marque como entregadas.
 * - Las de cuentas anuladas o devueltas salen; un pedido rechazado se borra y sus comandas
 *   con él (ON DELETE CASCADE).
 */
async function board(req, { warehouse_id, v } = {}) {
  if (!req.company_id) throw fail("Selecciona una empresa", 400);

  const rep = { cid: req.company_id };
  const filtros = [];
  const wid = parseInt(warehouse_id, 10);
  if (wid) {
    await assertWarehouseAccess(req, wid);
    rep.wid = wid;
    filtros.push(`(k.warehouse_id = :wid OR k.warehouse_id IS NULL)`);
  } else {
    const permitidos = await visibleWarehouseIds(req);
    if (Array.isArray(permitidos)) {
      if (!permitidos.length) return { data: [], now: new Date().toISOString() };
      rep.permitidos = permitidos;
      filtros.push(`(k.warehouse_id IN (:permitidos) OR k.warehouse_id IS NULL)`);
    }
  }

  // Primero la huella (ver utils/huella.js): la pantalla pregunta cada 5 s y casi siempre no
  // cambió nada. Mismo WHERE que el tablero, así que una comanda que se vence (listas a las 2 h)
  // también la cambia. Sin cambios, no se arma la lista de platos de cada comanda.
  const DONDE = `
     WHERE k.company_id = :cid
       AND k.status IN ('nueva', 'preparando', 'lista')
       AND s.status NOT IN ('anulado', 'devuelto')
       AND k.created_at > NOW() - INTERVAL '18 hours'
       AND (k.status <> 'lista' OR k.status_at > NOW() - INTERVAL '2 hours')
       ${filtros.map(f => `AND ${f}`).join("\n       ")}`;
  const huellaActual = await huella(
    `cocina:${req.company_id}:${rep.wid || (rep.permitidos ? rep.permitidos.join(".") : "todas")}`,
    `SELECT md5(COALESCE(string_agg(k.id || ':' || k.status || ':' || s.status || ':' || COALESCE(k.table_id, 0), ',' ORDER BY k.id), '')) AS v
       FROM kitchen_tickets k JOIN sales s ON s.id = k.sale_id ${DONDE}`,
    rep, 2000,
  );
  if (v && v === huellaActual) return { unchanged: true, v: huellaActual, now: new Date().toISOString() };

  const data = await sequelize.query(`
    SELECT k.id, k.sale_id, k.round_no, k.label, k.note, k.created_at,
           k.status AS kitchen_status, k.status_at AS kitchen_status_at,
           k.warehouse_id, s.status, s.invoice_number,
           t.name AS table_name, e.full_name AS waiter_name,
           (SELECT json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'note', i.note, 'modifiers', i.modifiers) ORDER BY i.id)
              FROM kitchen_ticket_items i WHERE i.ticket_id = k.id) AS items
      FROM kitchen_tickets k
      JOIN sales s ON s.id = k.sale_id
      LEFT JOIN dining_tables t ON t.id = k.table_id
      LEFT JOIN employees e ON e.id = k.waiter_id
     ${DONDE}
     ORDER BY k.created_at
     LIMIT 200`, { replacements: rep, type: QT.SELECT });

  // La hora del servidor viaja con el tablero: los minutos de espera se cuentan contra ella y
  // no contra el reloj de la tablet, que en una cocina nadie pone en hora.
  return { data, v: huellaActual, now: new Date().toISOString() };
}

async function setStatus(req, id, { status } = {}) {
  if (!ESTADOS.includes(status)) throw fail("Estado de comanda no válido", 400);
  const ticket = await KitchenTicket.findOne({ where: { id: parseInt(id, 10) || 0, company_id: req.company_id } });
  if (!ticket) throw fail("Comanda no encontrada", 404);
  await assertWarehouseAccess(req, ticket.warehouse_id, { optional: true });

  await sequelize.transaction(async (transaction) => {
    // ready_at guarda la primera vez que quedó lista: si alguien la devuelve a preparación por
    // error y la vuelve a marcar, no se pierde la hora real.
    await ticket.update({
      status,
      status_at: new Date(),
      ready_at: status === "lista" ? (ticket.ready_at || new Date()) : ticket.ready_at,
    }, { transaction });
    await resumirCuenta(ticket.sale_id, transaction);
  });
  olvidarHuellas(req.company_id);

  return { data: { id: ticket.id, kitchen_status: status } };
}

/**
 * Comanda de una venta de caja: el restaurante donde se cobra antes de pedir (comida rápida,
 * para llevar). La caja la manda al facturar, con los platos tal como los armó —adicionales
 * debajo de cada uno—, porque en la venta los extras son líneas sueltas y la cocina los tiene
 * que ver junto a su plato.
 *
 * Si la cuenta ya pasó por cocina (rondas del mesonero, pedido del catálogo) no se manda de
 * nuevo: lo que la cocina tenía que preparar ya lo tiene.
 *
 * body: { items: [{ product_id, name, quantity, note, modifiers }], label? }
 */
async function fromSale(req, saleId, { items, label } = {}) {
  const sale = await Sale.findOne({ where: { id: parseInt(saleId, 10) || 0, company_id: req.company_id } });
  if (!sale) throw fail("Venta no encontrada", 404);
  await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });
  if (["anulado", "devuelto"].includes(sale.status)) throw fail("La venta está anulada", 400);

  const ya = await KitchenTicket.count({ where: { sale_id: sale.id } });
  if (ya) return { data: { skipped: true } };

  const lineas = (Array.isArray(items) ? items : []).slice(0, 80).map(i => ({
    product_id: parseInt(i.product_id, 10) || null,
    name: String(i.name || "").trim().slice(0, 255),
    quantity: parseFloat(i.quantity),
    note: i.note,
    modifiers: i.modifiers,
  })).filter(i => i.name && i.quantity > 0 && i.quantity <= 9999);
  if (!lineas.length) throw fail("La comanda está vacía", 400);

  const ticket = await sequelize.transaction(t => crearComanda({
    sale, items: lineas,
    label: String(label || "").trim().slice(0, 120) || `Para llevar · ${sale.invoice_number || `#${sale.id}`}`,
    warehouseId: sale.warehouse_id,
  }, t));
  return { data: { id: ticket.id } };
}

module.exports = { board, setStatus, crearComanda, resumirCuenta, fromSale, ESTADOS };
