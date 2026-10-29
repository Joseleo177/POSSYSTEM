'use strict';

/**
 * Módulo Pedidos: la bandeja de los pedidos que llegan del catálogo (extra pedidos_web).
 *
 * Un pedido 'pedido' todavía no es nada para la caja: aquí se revisa (productos, entrega,
 * pagos reportados), se le ajusta el delivery o se le suma un recargo con su motivo, y al
 * aceptarlo pasa al POS como cuenta en espera, por el mismo acceptWebOrder de siempre (que es
 * el que descuenta el inventario). Rechazarlo lo borra —nunca fue documento— pero el motivo
 * queda en web_order_rejections para que el cliente lo vea en "Mis pedidos".
 *
 * Decisiones del usuario (29-10-2026): el adicional solo se le informa al cliente (no lo
 * aprueba), y el módulo llega hasta aceptar; lo demás sigue en la caja.
 */

const {
  sequelize, Sequelize, Sale, SaleItem, Serie, DeliveryZone, PaymentReport, Payment,
} = require("../models");
const { visibleWarehouseIds, assertWarehouseAccess, isAdmin } = require("../middleware/auth");
const acceptWebOrder = require("./sales/acceptWebOrder");
const paymentReports = require("./paymentReports");
const { zonasDe } = require("./catalogCheckout");
const { imageUrl } = require("../utils/imageStorage");

const QT = Sequelize.QueryTypes;
const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const num = (v) => r2(String(v ?? "").replace(",", "."));

const companyOf = (req) => {
  const c = req.employee?.company_id ?? null;
  if (!c) throw fail("Elige una empresa");
  return parseInt(c, 10);
};

// Recorte por sucursal: un encargado solo ve los pedidos de sus tiendas. El pedido nace con la
// sucursal que eligió el cliente (requested_warehouse_id) y, aceptado, con la que lo despacha.
async function filtroSucursal(req) {
  const allowed = await visibleWarehouseIds(req);
  if (allowed === null) return { sql: "", rep: {} };
  return {
    sql: `AND (COALESCE(s.warehouse_id, s.requested_warehouse_id) IS NULL
               OR COALESCE(s.warehouse_id, s.requested_warehouse_id) IN (:allowed))`,
    rep: { allowed: allowed.length ? allowed : [-1] },
  };
}

// Lista de una pestaña. "nuevos" = por aceptar; "aceptados" = los de los últimos tres días que
// ya pasaron a la caja (para ver en qué quedaron). Una consulta por página, con el resumen de
// pagos reportados incluido: la lista se refresca sola cada pocos segundos.
async function list(req, query = {}) {
  const companyId = companyOf(req);
  const tab = query.tab === "aceptados" ? "aceptados" : "nuevos";
  const f = await filtroSucursal(req);
  const rows = await sequelize.query(`
    SELECT s.id, s.status, s.total, s.created_at, s.invoice_number, s.kitchen_status,
           s.fulfillment, s.delivery_address, s.service_charge, s.web_note,
           COALESCE(c.name, s.web_customer_name) AS customer_name, c.rif AS customer_rif,
           s.web_customer_phone, w.name AS warehouse_name,
           (SELECT COUNT(*)::int FROM sale_items si WHERE si.sale_id = s.id) AS items_count,
           (SELECT string_agg(trim(to_char(si.quantity, 'FM999990.###')) || ' × ' || si.name, ', ' ORDER BY si.id)
              FROM sale_items si WHERE si.sale_id = s.id) AS resumen,
           -- Las fotos de los primeros productos: la fila se reconoce de un vistazo.
           (SELECT array_agg(f.image_filename) FROM (
              SELECT p.image_filename FROM sale_items si JOIN products p ON p.id = si.product_id
               WHERE si.sale_id = s.id AND p.image_filename IS NOT NULL ORDER BY si.id LIMIT 3) f) AS fotos,
           (SELECT CASE WHEN bool_or(r.status IN ('confirmado', 'aplicado')) THEN 'confirmado'
                        WHEN bool_or(r.status = 'pendiente') THEN 'pendiente' END
              FROM payment_reports r WHERE r.sale_id = s.id) AS pago
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN warehouses w ON w.id = COALESCE(s.warehouse_id, s.requested_warehouse_id)
     WHERE s.company_id = :cid AND s.web_customer_name IS NOT NULL
       ${tab === "nuevos" ? "AND s.status = 'pedido'" : "AND s.status <> 'pedido' AND s.created_at > NOW() - INTERVAL '3 days'"}
       ${f.sql}
     ORDER BY s.created_at ${tab === "nuevos" ? "ASC" : "DESC"}
     LIMIT 150
  `, { replacements: { cid: companyId, ...f.rep }, type: QT.SELECT });

  const [{ nuevos }] = await sequelize.query(`
    SELECT COUNT(*)::int AS nuevos FROM sales s
     WHERE s.company_id = :cid AND s.status = 'pedido' AND s.web_customer_name IS NOT NULL ${f.sql}
  `, { replacements: { cid: companyId, ...f.rep }, type: QT.SELECT });

  return {
    data: rows.map(r => ({
      ...r,
      total: parseFloat(r.total),
      service_charge: parseFloat(r.service_charge || 0),
      fotos: (r.fotos || []).map(imageUrl).filter(Boolean),
    })),
    counts: { nuevos },
  };
}

async function cargarVenta(req, id, transaction) {
  const companyId = companyOf(req);
  const sale = await Sale.findOne({
    where: { id: parseInt(id, 10) || 0, company_id: companyId },
    transaction, lock: transaction ? true : undefined,
  });
  if (!sale || !sale.web_customer_name) throw fail("Pedido no encontrado", 404);
  await assertWarehouseAccess(req, sale.warehouse_id || sale.requested_warehouse_id, { optional: true });
  return sale;
}

// Series con las que este usuario puede facturar en esa sucursal. El admin, todas las de la
// sucursal; el resto, las que tiene asignadas (mismo criterio que la caja).
async function seriesPara(req, warehouseId) {
  if (!warehouseId) return [];
  const rows = await sequelize.query(`
    SELECT s.id, s.name, s.prefix FROM series s
     WHERE s.company_id = :cid AND s.warehouse_id = :wid AND s.active AND s.type = 'factura'
       ${isAdmin(req) ? "" : "AND EXISTS (SELECT 1 FROM user_series us WHERE us.serie_id = s.id AND us.user_id = :uid)"}
     ORDER BY s.id
  `, { replacements: { cid: companyOf(req), wid: warehouseId, uid: req.employee.id }, type: QT.SELECT });
  return rows;
}

async function detail(req, id) {
  const sale = await cargarVenta(req, id);
  const companyId = sale.company_id;
  const [items, reportes, extra, fotos] = await Promise.all([
    SaleItem.findAll({
      where: { sale_id: sale.id },
      attributes: ["id", "product_id", "name", "quantity", "price", "discount", "subtotal", "note"],
      order: [["id", "ASC"]],
    }),
    paymentReports.list(req, { sale_id: sale.id }),
    sequelize.query(`
      SELECT c.name AS customer_name, c.rif AS customer_rif, c.phone AS customer_phone,
             w.name AS requested_warehouse_name, z.name AS zone_name
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN warehouses w ON w.id = s.requested_warehouse_id
        LEFT JOIN delivery_zones z ON z.id = s.delivery_zone_id
       WHERE s.id = :id
    `, { replacements: { id: sale.id }, type: QT.SELECT }),
    sequelize.query(`
      SELECT p.id, p.image_filename FROM products p
       WHERE p.id IN (SELECT product_id FROM sale_items WHERE sale_id = :id) AND p.image_filename IS NOT NULL
    `, { replacements: { id: sale.id }, type: QT.SELECT }),
  ]);
  const fotoDe = new Map(fotos.map(f => [f.id, imageUrl(f.image_filename)]));
  const j = sale.toJSON();
  const productos = r2(items.reduce((acc, i) => acc + parseFloat(i.subtotal ?? (i.price - (i.discount || 0)) * i.quantity), 0));
  const esNuevo = sale.status === "pedido";
  return {
    data: {
      ...j,
      ...extra[0],
      total: parseFloat(j.total),
      service_charge: parseFloat(j.service_charge || 0),
      delivery_fee: j.delivery_fee != null ? parseFloat(j.delivery_fee) : null,
      extra_charge: j.extra_charge != null ? parseFloat(j.extra_charge) : null,
      products_total: productos,
      items: items.map(i => ({
        id: i.id, product_id: i.product_id, name: i.name, note: i.note,
        image_url: fotoDe.get(i.product_id) || null,
        quantity: parseFloat(i.quantity), price: parseFloat(i.price),
        subtotal: parseFloat(i.subtotal ?? i.price * i.quantity),
      })),
      payment_reports: reportes.data,
      // Para ajustar y aceptar: las zonas de su sucursal y las series con que se puede facturar.
      zones: esNuevo && j.fulfillment === "delivery"
        ? (await zonasDe(companyId, j.requested_warehouse_id ?? null)).map(z => ({ id: z.id, name: z.name, price: z.price }))
        : [],
      series: esNuevo ? await seriesPara(req, j.requested_warehouse_id) : [],
    },
  };
}

// Etiqueta del recargo tal como la ve la caja y sale en el ticket (40 caracteres).
function etiqueta(fee, extra, reason, zoneName) {
  const delivery = zoneName ? `Delivery · ${zoneName}` : "Delivery";
  if (fee > 0 && extra > 0) return `Delivery + ${reason}`.slice(0, 40);
  if (fee > 0) return delivery.slice(0, 40);
  if (extra > 0) return String(reason).slice(0, 40);
  return null;
}

/**
 * Ajusta lo que se cobra aparte de los productos antes de aceptar: el delivery (otra zona u
 * otro monto) y un recargo con su motivo. El total se rehace con las líneas guardadas, y lo que
 * el cliente debe por reportar se recalcula solo (se lee del total).
 */
async function ajustar(req, id, body = {}) {
  return sequelize.transaction(async (t) => {
    const sale = await cargarVenta(req, id, t);
    if (sale.status !== "pedido") throw fail("Este pedido ya fue aceptado: ajústalo desde la caja");

    let zona = null;
    if (body.delivery_zone_id !== undefined && body.delivery_zone_id !== null && body.delivery_zone_id !== "") {
      zona = await DeliveryZone.findOne({ where: { id: parseInt(body.delivery_zone_id, 10) || 0, company_id: sale.company_id }, transaction: t });
      if (!zona) throw fail("Zona no encontrada");
    } else if (sale.delivery_zone_id) {
      zona = await DeliveryZone.findByPk(sale.delivery_zone_id, { transaction: t });
    }

    const fee = sale.fulfillment === "delivery"
      ? Math.max(0, body.delivery_fee !== undefined ? num(body.delivery_fee) : (zona ? r2(zona.price) : parseFloat(sale.delivery_fee || 0)))
      : 0;
    const extra = Math.max(0, num(body.extra_charge));
    const reason = String(body.extra_charge_reason || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (extra > 0 && reason.length < 3) throw fail("Indica el motivo del recargo: el cliente lo verá en su pedido");

    const [{ productos }] = await sequelize.query(
      `SELECT COALESCE(SUM(subtotal), 0) AS productos FROM sale_items WHERE sale_id = :id`,
      { replacements: { id: sale.id }, type: QT.SELECT, transaction: t },
    );
    const cargo = r2(fee + extra);
    const total = r2(parseFloat(productos) - parseFloat(sale.discount_amount || 0) + cargo);

    await sale.update({
      delivery_zone_id: zona ? zona.id : sale.delivery_zone_id,
      delivery_fee: sale.fulfillment === "delivery" ? fee : null,
      extra_charge: extra > 0 ? extra : null,
      extra_charge_reason: extra > 0 ? reason : null,
      service_charge: cargo,
      service_charge_label: etiqueta(fee, extra, reason, zona?.name),
      total,
    }, { transaction: t });
    return { data: { total, service_charge: cargo } };
  });
}

// Aceptar: pasa al POS como cuenta en espera. La sucursal es la que eligió el cliente salvo
// que se indique otra; la serie, la que se elija o la única que tenga el usuario ahí.
async function aceptar(req, id, body = {}) {
  const sale = await cargarVenta(req, id);
  if (sale.status !== "pedido") throw fail("Este pedido ya fue aceptado o rechazado");
  const warehouseId = parseInt(body.warehouse_id, 10) || sale.requested_warehouse_id;
  if (!warehouseId) throw fail("Elige la sucursal que despacha el pedido");
  await assertWarehouseAccess(req, warehouseId);
  let serieId = parseInt(body.serie_id, 10) || null;
  if (!serieId) {
    const series = await seriesPara(req, warehouseId);
    if (!series.length) throw fail("No tienes una serie de facturas en esa sucursal. Pide que te asignen una.");
    if (series.length > 1) throw fail("Elige con qué serie se factura");
    serieId = series[0].id;
  }
  const venta = await acceptWebOrder(sale.id, { warehouse_id: warehouseId, serie_id: serieId, employee_id: req.employee.id });
  return { data: venta };
}

/**
 * Rechazar: el pedido se borra como en la caja, y queda el motivo para el cliente. Los pagos
 * que reportó y nadie confirmó se rechazan con el mismo motivo; uno ya confirmado se deja, sin
 * pedido, en Pagos reportados: ese dinero entró y hay que devolverlo.
 */
async function rechazar(req, id, body = {}) {
  const reason = String(body.reason || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (reason.length < 3) throw fail("Indica el motivo: el cliente lo verá en su pedido");
  return sequelize.transaction(async (t) => {
    const sale = await cargarVenta(req, id, t);
    if (sale.status !== "pedido") throw fail("Este pedido ya fue aceptado: anúlalo desde la caja");
    const items = await SaleItem.findAll({ where: { sale_id: sale.id }, attributes: ["name", "quantity"], transaction: t });
    await sequelize.query(`
      INSERT INTO web_order_rejections (company_id, sale_id, customer_id, reason, total, items, ordered_at, employee_id)
      VALUES (:cid, :sid, :cust, :reason, :total, CAST(:items AS JSONB), :ordered, :emp)
    `, {
      replacements: {
        cid: sale.company_id, sid: sale.id, cust: sale.customer_id, reason, total: sale.total,
        items: JSON.stringify(items.map(i => ({ name: i.name, quantity: parseFloat(i.quantity) }))),
        ordered: sale.created_at, emp: req.employee.id,
      },
      transaction: t,
    });
    await PaymentReport.update(
      { status: "rechazado", reject_reason: `Pedido rechazado: ${reason}`.slice(0, 200), statement_line_id: null, reviewed_by: req.employee.id, reviewed_at: new Date() },
      { where: { sale_id: sale.id, status: "pendiente" }, transaction: t },
    );
    const confirmados = await PaymentReport.count({ where: { sale_id: sale.id, status: "confirmado" }, transaction: t });
    await Payment.destroy({ where: { sale_id: sale.id }, transaction: t });
    await sale.destroy({ transaction: t });
    return { data: { id: sale.id, refund_pending: confirmados > 0 } };
  });
}

module.exports = { list, detail, ajustar, aceptar, rechazar };
