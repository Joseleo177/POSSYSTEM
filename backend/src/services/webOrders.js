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
 * aprueba). Desde el 30-10-2026 el módulo sigue el pedido después de aceptarlo: qué va a cocina
 * (se elige al aceptar, por producto: products.kitchen_prep), y su despacho —aceptado → listo →
 * en camino (delivery) → entregado— en sales.fulfillment_status. El cobro y la factura siguen
 * siendo de la caja ("Cobrar en la caja" abre la cuenta en el POS); aquí solo se muestran.
 */

const {
  sequelize, Sequelize, Sale, SaleItem, Serie, PaymentReport, Payment, Product, Company,
} = require("../models");
const { crearComanda } = require("./kitchen");
const { visibleWarehouseIds, assertWarehouseAccess, isAdmin } = require("../middleware/auth");
const acceptWebOrder = require("./sales/acceptWebOrder");
const paymentReports = require("./paymentReports");
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

// Pagado = cobrado del todo (o perdonado). Lo demás aceptado todavía se le debe a la caja.
const PAGADO_SQL = "s.status IN ('pagado', 'exonerado')";
// En curso = aceptado y le falta algo: entregarlo o cobrarlo. Un pedido entregado que se paga
// al recibir sigue aquí hasta que la caja lo cobra. Lo anulado sale.
const EN_CURSO_SQL = `s.status NOT IN ('pedido', 'anulado')
  AND (COALESCE(s.fulfillment_status, 'aceptado') <> 'entregado' OR NOT (${PAGADO_SQL}))`;

// Lista de una pestaña:
//   "nuevos"   = por aceptar;
//   "curso"    = aceptados a los que les falta entregar o cobrar (sin límite de días: un
//                pedido no se cierra solo porque pasó el tiempo);
//   "cerrados" = entregados y cobrados (o anulados) de los últimos tres días.
// Una consulta por página, con el resumen de pagos reportados incluido: la lista se refresca
// sola cada pocos segundos.
async function list(req, query = {}) {
  const companyId = companyOf(req);
  const tab = ["curso", "cerrados"].includes(query.tab) ? query.tab : "nuevos";
  const filtroTab = tab === "nuevos" ? "AND s.status = 'pedido'"
    : tab === "curso" ? `AND ${EN_CURSO_SQL}`
      : `AND s.status <> 'pedido' AND NOT (${EN_CURSO_SQL}) AND s.created_at > NOW() - INTERVAL '3 days'`;
  const f = await filtroSucursal(req);
  const rows = await sequelize.query(`
    SELECT s.id, s.status, s.total, s.created_at, s.invoice_number, s.kitchen_status,
           s.fulfillment_status, s.fulfillment_status_at,
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
       ${filtroTab}
       ${f.sql}
     ORDER BY s.created_at ${tab === "cerrados" ? "DESC" : "ASC"}
     LIMIT 150
  `, { replacements: { cid: companyId, ...f.rep }, type: QT.SELECT });

  const [{ nuevos, curso }] = await sequelize.query(`
    SELECT COUNT(*) FILTER (WHERE s.status = 'pedido')::int AS nuevos,
           COUNT(*) FILTER (WHERE ${EN_CURSO_SQL})::int AS curso
      FROM sales s
     WHERE s.company_id = :cid AND s.web_customer_name IS NOT NULL ${f.sql}
  `, { replacements: { cid: companyId, ...f.rep }, type: QT.SELECT });

  return {
    data: rows.map(r => ({
      ...r,
      total: parseFloat(r.total),
      service_charge: parseFloat(r.service_charge || 0),
      fotos: (r.fotos || []).map(imageUrl).filter(Boolean),
    })),
    counts: { nuevos, curso },
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
  const [items, reportes, extra, fotos, empresa] = await Promise.all([
    SaleItem.findAll({
      where: { sale_id: sale.id },
      attributes: ["id", "product_id", "name", "quantity", "price", "discount", "subtotal", "note"],
      // Qué se prepara en cocina y qué es adicional de un plato: para marcar la comanda al aceptar.
      include: [{ model: Product, attributes: ["kitchen_prep", "is_addon"], required: false }],
      order: [["id", "ASC"]],
    }),
    paymentReports.list(req, { sale_id: sale.id }),
    sequelize.query(`
      SELECT c.name AS customer_name, c.rif AS customer_rif, c.phone AS customer_phone,
             w.name AS requested_warehouse_name
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN warehouses w ON w.id = s.requested_warehouse_id
       WHERE s.id = :id
    `, { replacements: { id: sale.id }, type: QT.SELECT }),
    sequelize.query(`
      SELECT p.id, p.image_filename FROM products p
       WHERE p.id IN (SELECT product_id FROM sale_items WHERE sale_id = :id) AND p.image_filename IS NOT NULL
    `, { replacements: { id: sale.id }, type: QT.SELECT }),
    Company.findByPk(companyId, { attributes: ["cocina_enabled"] }),
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
        kitchen_prep: !!i.Product?.kitchen_prep,
        is_addon: !!i.Product?.is_addon,
      })),
      cocina_enabled: !!empresa?.cocina_enabled,
      paid: ["pagado", "exonerado"].includes(sale.status),
      payment_reports: reportes.data,
      delivery_km: j.delivery_km != null ? parseFloat(j.delivery_km) : null,
      // Para aceptar: las series con que este usuario puede facturar en la sucursal.
      series: esNuevo ? await seriesPara(req, j.requested_warehouse_id) : [],
    },
  };
}

// Etiqueta del recargo tal como la ve la caja y sale en el ticket (40 caracteres).
function etiqueta(fee, extra, reason, km) {
  const delivery = km ? `Delivery · ${String(km).replace(".", ",")} km` : "Delivery";
  if (fee > 0 && extra > 0) return `Delivery + ${reason}`.slice(0, 40);
  if (fee > 0) return delivery.slice(0, 40);
  if (extra > 0) return String(reason).slice(0, 40);
  return null;
}

/**
 * Ajusta lo que se cobra aparte de los productos antes de aceptar: el delivery (lo calculado
 * por distancia, u otro monto) y un recargo con su motivo. El total se rehace con las líneas
 * guardadas, y lo que el cliente debe por reportar se recalcula solo (se lee del total).
 */
async function ajustar(req, id, body = {}) {
  return sequelize.transaction(async (t) => {
    const sale = await cargarVenta(req, id, t);
    if (sale.status !== "pedido") throw fail("Este pedido ya fue aceptado: ajústalo desde la caja");

    const fee = sale.fulfillment === "delivery"
      ? Math.max(0, body.delivery_fee !== undefined ? num(body.delivery_fee) : parseFloat(sale.delivery_fee || 0))
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
      delivery_fee: sale.fulfillment === "delivery" ? fee : null,
      extra_charge: extra > 0 ? extra : null,
      extra_charge_reason: extra > 0 ? reason : null,
      service_charge: cargo,
      service_charge_label: etiqueta(fee, extra, reason, sale.delivery_km != null ? parseFloat(sale.delivery_km) : null),
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
  const comanda = await mandarACocina(req, sale, body.cocina, warehouseId);
  return { data: { ...venta, kitchen_sent: comanda } };
}

/**
 * La comanda del pedido, con las líneas que eligió quien lo aceptó (`ids` de sale_items; salen
 * marcadas las de productos con kitchen_prep y se pueden cambiar). Nada elegido o empresa sin
 * cocina: no se manda nada. Los adicionales con precio no van como líneas sueltas: van debajo
 * del plato que tienen delante, como en la mesa ("+ Queso extra").
 */
async function mandarACocina(req, sale, ids, warehouseId) {
  const elegidos = new Set((Array.isArray(ids) ? ids : []).map(n => parseInt(n, 10)).filter(Boolean));
  if (!elegidos.size) return 0;
  const empresa = await Company.findByPk(sale.company_id, { attributes: ["cocina_enabled"] });
  if (!empresa?.cocina_enabled) return 0;

  const lineas = await SaleItem.findAll({
    where: { sale_id: sale.id },
    attributes: ["id", "product_id", "name", "quantity", "note"],
    include: [{ model: Product, attributes: ["is_addon"], required: false }],
    order: [["id", "ASC"]],
  });
  const platos = [];
  for (const l of lineas) {
    if (l.Product?.is_addon) {
      const plato = platos[platos.length - 1];
      if (plato) plato.extras.push(`+ ${l.name}`);
      continue;
    }
    platos.push({ linea: l, extras: [] });
  }
  const items = platos.filter(p => elegidos.has(p.linea.id)).map(({ linea, extras }) => ({
    product_id: linea.product_id, name: linea.name, quantity: parseFloat(linea.quantity),
    note: linea.note, modifiers: extras.length ? extras.join(" · ") : null,
  }));
  if (!items.length) return 0;

  const venta = await Sale.findByPk(sale.id);
  await sequelize.transaction(t => crearComanda({
    sale: venta, items, warehouseId,
    label: venta.fulfillment === "delivery" ? `Delivery · ${venta.web_customer_name}` : venta.web_customer_name,
    note: venta.web_note,
  }, t));
  return items.length;
}

// Etapas del despacho, en orden. "en_camino" solo existe para delivery.
const ETAPAS = ["aceptado", "listo", "en_camino", "entregado"];

/**
 * Avanza el despacho de un pedido aceptado. Se puede saltar pasos hacia adelante (un retiro que
 * se entrega en el acto pasa de "aceptado" a "entregado"), pero no volver atrás, salvo
 * `deshacer`, que regresa UN paso: para el toque equivocado, no para reescribir la historia.
 */
async function avanzar(req, id, body = {}) {
  return sequelize.transaction(async (t) => {
    const sale = await cargarVenta(req, id, t);
    if (sale.status === "pedido") throw fail("Primero acepta el pedido");
    if (sale.status === "anulado") throw fail("Este pedido fue anulado");
    const delivery = sale.fulfillment === "delivery";
    const pasos = ETAPAS.filter(e => delivery || e !== "en_camino");
    const actual = pasos.indexOf(sale.fulfillment_status || "aceptado");

    let destino;
    if (body.deshacer) {
      if (actual <= 0) throw fail("Ya está en el primer paso");
      destino = pasos[actual - 1];
    } else {
      destino = String(body.stage || "");
      const i = pasos.indexOf(destino);
      if (i < 0) throw fail(delivery ? "Etapa no válida" : "Un pedido para retirar no pasa por \"En camino\"");
      if (i <= actual) throw fail("El pedido ya pasó por esa etapa");
    }

    await sale.update({
      fulfillment_status: destino,
      fulfillment_status_at: new Date(),
      delivered_at: destino === "entregado" ? new Date() : null,
    }, { transaction: t });
    return { data: { id: sale.id, fulfillment_status: destino } };
  });
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

module.exports = { list, detail, ajustar, aceptar, avanzar, rechazar };
