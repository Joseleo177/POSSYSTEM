/**
 * Regalos de la cobranza (ver migración 20261110100000-cobranza-regalos).
 *
 * Al saldar su bolsa el cliente gana un obsequio. No hay regla fija (a veces se da aunque quede
 * un resto): el sistema SUGIERE las bolsas pagadas que no tienen regalo, y el cobrador elige qué
 * da y cuándo. El inventario se controla de verdad:
 *  - "por entregar" aparta el producto: no mueve existencia, pero lo apartado ya no está
 *    disponible para otro cliente;
 *  - "entregado" lo descuenta de la sucursal del sector (moveStock, motivo 'regalo', notas
 *    "RG-0001 · Cliente"), y el kardex lo muestra como Regalo;
 *  - anular uno entregado lo devuelve a la existencia con otra línea.
 */
const { sequelize, Sequelize } = require("../../models");
const { hasPermission, isAdmin } = require("../../middleware/auth");
const { moveStock, lockNumbering } = require("../factory/shared");
const { GIFT_CATEGORIES_KEY, leerLista } = require("./config");

const MAX_QTY = 50;

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const int = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) ? n : null; };
const Q = (sql, replacements, transaction) => sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT, transaction });
const rgCode = (n) => `RG-${String(n).padStart(4, "0")}`;
const fmtQty = (n) => String(parseFloat(n)).replace(".", ",");

// Perezoso: index.js también requiere este archivo.
const base = () => require("./index");

// Las categorías de las que salen los regalos. Una borrada del catálogo simplemente no aparece.
async function categoriasRegalos(companyId) {
  const ids = await leerLista(GIFT_CATEGORIES_KEY, companyId);
  if (!ids.length) return [];
  return Q(`SELECT id, name FROM categories WHERE id IN (:ids) AND company_id = :companyId ORDER BY lower(name)`, { ids, companyId });
}

// Existencia, apartado y disponible de cada regalo en una sucursal.
const DISPONIBLE_SQL = `
  SELECT p.id, p.name, p.unit, p.category_id,
         COALESCE(ps.qty, 0)::float AS stock,
         COALESCE((SELECT SUM(r.qty) FROM cobranza_regalos r
                    WHERE r.product_id = p.id AND r.warehouse_id = :wid AND r.status = 'por_entregar'), 0)::float AS apartado
    FROM products p
    LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid`;

/** Regalos que se pueden dar en la sucursal del cliente, con lo que queda libre de cada uno. */
async function opciones(req, customerId) {
  const { a, cliente } = await base().clienteAlAlcance(req, customerId);
  const categorias = await categoriasRegalos(a.companyId);
  if (!categorias.length || !cliente.warehouse_id) return { data: { categorias, productos: [] } };
  const productos = await Q(`${DISPONIBLE_SQL}
     WHERE p.company_id = :companyId AND p.category_id IN (:cats) AND NOT p.is_variant_parent
     ORDER BY lower(p.name)`, { companyId: a.companyId, cats: categorias.map(c => c.id), wid: cliente.warehouse_id });
  return {
    data: {
      categorias,
      productos: productos.map(p => ({ ...p, disponible: Math.round((p.stock - p.apartado) * 1000) / 1000 })),
    },
  };
}

async function disponibleDe(productId, warehouseId, transaction) {
  const [p] = await Q(`${DISPONIBLE_SQL} WHERE p.id = :pid`, { pid: productId, wid: warehouseId }, transaction);
  return p ? { ...p, disponible: p.stock - p.apartado } : null;
}

const SELECT_REGALO = `
  SELECT r.id, r.number, 'RG-' || lpad(r.number::text, 4, '0') AS code, r.status, r.qty::float AS qty, r.notes,
         r.customer_id, c.name AS customer_name, c.address AS customer_address, c.phone AS customer_phone,
         c.sector_id, sec.name AS sector_name,
         r.product_id, p.name AS product_name, r.warehouse_id, w.name AS warehouse_name,
         r.sale_id, s.invoice_number,
         r.assigned_at, ea.full_name AS assigned_by_name,
         r.delivered_at, ed.full_name AS delivered_by_name,
         r.voided_at, r.void_reason
    FROM cobranza_regalos r
    JOIN customers c ON c.id = r.customer_id
    LEFT JOIN cobranza_sectors sec ON sec.id = c.sector_id
    JOIN products p ON p.id = r.product_id
    LEFT JOIN warehouses w ON w.id = r.warehouse_id
    LEFT JOIN sales s ON s.id = r.sale_id
    LEFT JOIN employees ea ON ea.id = r.assigned_by
    LEFT JOIN employees ed ON ed.id = r.delivered_by`;

/**
 * Lo que queda: de cada regalo, cuánto hay en la sucursal, cuánto está apartado y cuánto está
 * libre. Solo las sucursales de los sectores al alcance: el cobrador ve el galpón del que sale
 * su mercancía, no el resto de la empresa. Una sola consulta, con todo lo que la pantalla pide.
 */
async function existencia(req, { sector_id } = {}) {
  const a = await base().alcance(req);
  const categorias = await categoriasRegalos(a.companyId);
  const sid = int(sector_id);
  if (sid && !a.todos && !a.sectorIds.includes(sid)) throw fail("Ese sector no es tuyo", 403);
  if (!categorias.length) return { data: [], categorias };
  const filtro = sid ? "s.id = :sid" : (a.todos ? "TRUE" : (a.sectorIds.length ? `s.id IN (${a.sectorIds.join(",")})` : "FALSE"));
  const rows = await Q(`
    WITH suc AS (
      SELECT DISTINCT w.id, w.name
        FROM cobranza_sectors s JOIN warehouses w ON w.id = s.warehouse_id
       WHERE s.company_id = :companyId AND s.active AND ${filtro}
    ), apartado AS (
      SELECT r.warehouse_id, r.product_id, SUM(r.qty) AS qty
        FROM cobranza_regalos r
       WHERE r.company_id = :companyId AND r.status = 'por_entregar'
       GROUP BY r.warehouse_id, r.product_id
    )
    SELECT suc.id AS warehouse_id, suc.name AS warehouse_name,
           p.id AS product_id, p.name, p.unit, c.id AS category_id, c.name AS category_name,
           COALESCE(ps.qty, 0)::float AS stock, COALESCE(ap.qty, 0)::float AS apartado
      FROM suc
     CROSS JOIN products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = suc.id
      LEFT JOIN apartado ap ON ap.product_id = p.id AND ap.warehouse_id = suc.id
     WHERE p.company_id = :companyId AND p.category_id IN (:cats) AND NOT p.is_variant_parent
     ORDER BY lower(suc.name), lower(c.name), lower(p.name)`,
    { companyId: a.companyId, cats: categorias.map(c => c.id), sid });
  return { data: rows.map(r => ({ ...r, libre: Math.round((r.stock - r.apartado) * 1000) / 1000 })), categorias };
}

/** Regalos de los sectores al alcance; por omisión, los que faltan por entregar. */
async function listar(req, { status, sector_id } = {}) {
  const a = await base().alcance(req);
  const rep = { companyId: a.companyId };
  const where = ["r.company_id = :companyId"];
  const st = ["por_entregar", "entregado", "anulado"].includes(status) ? status : "por_entregar";
  where.push("r.status = :st"); rep.st = st;
  const sid = int(sector_id);
  if (sid) {
    if (!a.todos && !a.sectorIds.includes(sid)) throw fail("Ese sector no es tuyo", 403);
    where.push("c.sector_id = :sid"); rep.sid = sid;
  } else if (!a.todos) {
    where.push(a.sectorIds.length ? `c.sector_id IN (${a.sectorIds.join(",")})` : "FALSE");
  }
  const data = await Q(`${SELECT_REGALO} WHERE ${where.join(" AND ")}
     ORDER BY ${st === "por_entregar" ? "r.assigned_at ASC" : "COALESCE(r.voided_at, r.delivered_at, r.assigned_at) DESC"}
     LIMIT 300`, rep);
  return { data };
}

/**
 * Lo que la ficha necesita: los regalos del cliente y las bolsas que ya pagó sin regalo (la
 * sugerencia). Solo las de los últimos 180 días: lo viejo no tiene por qué reaparecer.
 */
async function deCliente(companyId, customerId, productIds = []) {
  const regalos = await Q(`${SELECT_REGALO}
     WHERE r.company_id = :companyId AND r.customer_id = :cid
     ORDER BY r.assigned_at DESC LIMIT 30`, { companyId, cid: customerId });
  const ganados = productIds.length ? await Q(`
    SELECT s.id, s.invoice_number, to_char((s.created_at AT TIME ZONE 'America/Caracas')::date, 'YYYY-MM-DD') AS day
      FROM sales s
     WHERE s.company_id = :companyId AND s.customer_id = :cid AND s.status = 'pagado'
       AND s.created_at > NOW() - INTERVAL '180 days'
       AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.product_id IN (:productIds))
       AND NOT EXISTS (SELECT 1 FROM cobranza_regalos r WHERE r.sale_id = s.id AND r.status <> 'anulado')
     ORDER BY s.created_at ASC`, { companyId, cid: customerId, productIds }) : [];
  return { regalos, ganados };
}

async function salidaDeStock(req, regalo, cliente, transaction, signo = -1, anulado = false) {
  await moveStock({
    productId: regalo.product_id, warehouseId: regalo.warehouse_id, delta: signo * parseFloat(regalo.qty),
    notes: `${rgCode(regalo.number)} · ${anulado ? "Anulado · " : ""}${cliente}`.slice(0, 200),
    req, transaction, reason: "regalo",
  });
}

/**
 * Asigna un regalo al cliente. `entregar`: el cobrador lo trae consigo y lo da en la visita
 * (sale de la existencia ya); si no, queda apartado para la próxima.
 */
async function asignar(req, customerId, body = {}) {
  const { a, cliente } = await base().clienteAlAlcance(req, customerId);
  if (!cliente.sector_id || !cliente.warehouse_id) throw fail("El cliente necesita un sector para recibir regalos");
  const categorias = await categoriasRegalos(a.companyId);
  if (!categorias.length) throw fail("Falta elegir las categorías de los regalos (Cobranza → Sectores)");
  const pid = int(body.product_id);
  const qty = int(body.qty) || 1;
  if (qty < 1 || qty > MAX_QTY) throw fail(`La cantidad va de 1 a ${MAX_QTY}`);
  const [prod] = pid ? await Q(`SELECT id, name FROM products WHERE id = :pid AND company_id = :companyId AND category_id IN (:cats)`,
    { pid, companyId: a.companyId, cats: categorias.map(c => c.id) }) : [];
  if (!prod) throw fail("Elige un regalo de la lista");
  const saleId = int(body.sale_id);
  if (saleId) {
    const [s] = await Q(`SELECT id FROM sales WHERE id = :saleId AND customer_id = :cid AND company_id = :companyId`,
      { saleId, cid: cliente.id, companyId: a.companyId });
    if (!s) throw fail("Esa factura no es de este cliente");
  }
  const entregar = !!body.entregar;

  const t = await sequelize.transaction();
  try {
    // Un regalo a la vez por empresa: dos cobradores no pueden apartar la última silla los dos.
    await lockNumbering("regalo", a.companyId, t);
    if (saleId) {
      const [ya] = await Q(`SELECT id FROM cobranza_regalos WHERE sale_id = :saleId AND status <> 'anulado'`, { saleId }, t);
      if (ya) throw fail("Esa factura ya tiene su regalo");
    }
    const d = await disponibleDe(prod.id, cliente.warehouse_id, t);
    if (!d || d.disponible < qty) {
      throw fail(`No alcanza: de ${prod.name} quedan ${fmtQty(Math.max(0, d?.stock || 0))}`
        + `${d?.apartado > 0 ? `, ${fmtQty(d.apartado)} ya apartado` : ""}.`);
    }
    const [{ n }] = await Q(`SELECT COALESCE(MAX(number), 0) + 1 AS n FROM cobranza_regalos WHERE company_id = :companyId`, { companyId: a.companyId }, t);
    const emp = req.employee?.id || null;
    const [r] = await sequelize.query(`
      INSERT INTO cobranza_regalos (company_id, number, customer_id, sale_id, product_id, warehouse_id, qty, status, notes,
                                    assigned_by, assigned_at, delivered_by, delivered_at)
      VALUES (:companyId, :n, :cid, :saleId, :pid, :wid, :qty, :status, :notes, :emp, NOW(), :demp, :dat)
      RETURNING id, number, product_id, warehouse_id, qty`, {
      replacements: {
        companyId: a.companyId, n, cid: cliente.id, saleId: saleId || null, pid: prod.id, wid: cliente.warehouse_id, qty,
        status: entregar ? "entregado" : "por_entregar", notes: String(body.notes || "").trim().slice(0, 300) || null,
        emp, demp: entregar ? emp : null, dat: entregar ? new Date() : null,
      },
      type: Sequelize.QueryTypes.SELECT, transaction: t,
    });
    if (entregar) await salidaDeStock(req, r, cliente.name, t);
    await t.commit();
    return { data: { id: r.id, code: rgCode(r.number), status: entregar ? "entregado" : "por_entregar", product_name: prod.name } };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function regaloAlAlcance(req, id, transaction) {
  const a = await base().alcance(req);
  const rid = int(id);
  const [r] = rid ? await Q(`
    SELECT r.*, c.name AS customer_name, c.sector_id FROM cobranza_regalos r JOIN customers c ON c.id = r.customer_id
     WHERE r.id = :rid AND r.company_id = :companyId FOR UPDATE OF r`, { rid, companyId: a.companyId }, transaction) : [];
  if (!r) throw fail("Regalo no encontrado", 404);
  if (!a.todos && !(r.sector_id && a.sectorIds.includes(r.sector_id))) throw fail("Ese cliente no es de tus sectores", 403);
  return r;
}

/** Entrega un regalo apartado: sale de la existencia en este momento. */
async function entregar(req, id) {
  const t = await sequelize.transaction();
  try {
    const r = await regaloAlAlcance(req, id, t);
    if (r.status === "entregado") throw fail(`${rgCode(r.number)} ya se entregó`);
    if (r.status !== "por_entregar") throw fail(`${rgCode(r.number)} está anulado`);
    const d = await disponibleDe(r.product_id, r.warehouse_id, t);
    if (!d || d.stock < parseFloat(r.qty)) {
      throw fail(`No hay ${fmtQty(r.qty)} en la sucursal (quedan ${fmtQty(Math.max(0, d?.stock || 0))}). Carga la existencia antes de entregarlo.`);
    }
    await sequelize.query(`UPDATE cobranza_regalos SET status = 'entregado', delivered_by = :emp, delivered_at = NOW() WHERE id = :id`,
      { replacements: { emp: req.employee?.id || null, id: r.id }, transaction: t });
    await salidaDeStock(req, r, r.customer_name, t);
    await t.commit();
    return { data: { id: r.id, code: rgCode(r.number), status: "entregado" } };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * Anula un regalo. Uno apartado lo anula quien da regalos (se libera lo apartado); uno ya
 * entregado solo quien administra la cobranza, y su existencia vuelve a la sucursal.
 */
async function anular(req, id, { reason } = {}) {
  const motivo = String(reason || "").trim().slice(0, 300);
  if (!motivo) throw fail("Escribe por qué se anula");
  const t = await sequelize.transaction();
  try {
    const r = await regaloAlAlcance(req, id, t);
    if (r.status === "anulado") throw fail(`${rgCode(r.number)} ya está anulado`);
    const admin = isAdmin(req) || hasPermission(req.employee?.permissions, "cobranza.manage");
    if (r.status === "entregado" && !admin) throw fail("Un regalo ya entregado solo lo anula quien administra la cobranza", 403);
    await sequelize.query(`UPDATE cobranza_regalos SET status = 'anulado', voided_by = :emp, voided_at = NOW(), void_reason = :motivo WHERE id = :id`,
      { replacements: { emp: req.employee?.id || null, id: r.id, motivo }, transaction: t });
    if (r.status === "entregado") await salidaDeStock(req, r, r.customer_name, t, +1, true);
    await t.commit();
    return { data: { id: r.id, code: rgCode(r.number), status: "anulado" } };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

module.exports = { categoriasRegalos, opciones, existencia, listar, deCliente, asignar, entregar, anular, rgCode };
