/**
 * Cobranza por sectores (ver migración 20261109100000-cobranza-sectores).
 *
 * El cobrador de calle recorre su pueblo: ve quién debe, registra el abono y, si el cliente
 * quiere, le deja otra bolsa. Nada de eso tiene contabilidad propia:
 *  - dejar la bolsa es una venta a crédito (createSale + confirmCreditSale), con la serie, la
 *    sucursal y el precio de siempre;
 *  - el abono es un cobro conjunto de las facturas abiertas del cliente (createBulkPayment), que
 *    imputa de la más vieja a la más nueva.
 * Así Cuentas por cobrar, el arqueo (cobros de quien los registró) y los reportes lo ven igual
 * que lo hecho en la caja.
 *
 * Alcance: el admin y quien tiene cobranza.all ven todos los sectores; los demás, solo los suyos
 * (cobranza_sector_employees). Toda operación sobre un cliente revisa que su sector esté al
 * alcance: el id viaja en la URL y bastaría con cambiarlo para cobrar en el pueblo de otro.
 */
const { sequelize, Sequelize, Currency, Serie, UserSerie } = require("../../models");
const { Op } = Sequelize;
const { hasPermission, isAdmin, employeeWarehouseIds } = require("../../middleware/auth");
const { settleToleranceSql } = require("../../utils/saleBalance");

const { PRODUCTS_KEY, GIFT_CATEGORIES_KEY, leerLista, guardarLista } = require("./config");
const MAX_BOLSAS = 20;

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });
const int = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) ? n : null; };
const Q = (sql, replacements) => sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });
const companyOf = (req) => req.company_id ?? req.employee?.company_id ?? null;
const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// Saldo de una factura, con la misma regla que Cuentas por cobrar (services/sales/receivables):
// total − cobrado neto del vuelto − crédito aplicado − devuelto con NC vigente − exonerado.
const SALDO_SQL = (a) => `(${a}.total
  - COALESCE((SELECT SUM(py.amount) - COALESCE(SUM(py.change_given) FILTER (WHERE py.change_journal_id IS NOT NULL), 0)
                FROM payments py WHERE py.sale_id = ${a}.id), 0)
  - COALESCE(${a}.credit_applied, 0)
  - COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id = ${a}.id AND r.status <> 'anulado'), 0)
  - COALESCE(${a}.forgiven_amount, 0))`;

// ── Alcance ──────────────────────────────────────────────────────────────────────────────────

async function alcance(req) {
  const companyId = companyOf(req);
  if (!companyId) throw fail("Elige una empresa");
  const todos = isAdmin(req) || hasPermission(req.employee?.permissions, "cobranza.all");
  if (todos) return { companyId, todos: true, sectorIds: null };
  const rows = await Q(
    `SELECT se.sector_id FROM cobranza_sector_employees se
       JOIN cobranza_sectors s ON s.id = se.sector_id
      WHERE se.employee_id = :emp AND s.company_id = :companyId`,
    { emp: req.employee?.id || 0, companyId });
  return { companyId, todos: false, sectorIds: rows.map(r => r.sector_id) };
}

// Filtro SQL de sectores al alcance para la columna `col`.
const filtroSector = (a, col) => (a.todos ? "TRUE" : (a.sectorIds.length ? `${col} IN (${a.sectorIds.join(",")})` : "FALSE"));

async function clienteAlAlcance(req, customerId) {
  const a = await alcance(req);
  const id = int(customerId);
  const [c] = id ? await Q(
    `SELECT c.id, c.name, c.rif, c.phone, c.address, c.sector_id,
            s.name AS sector_name, s.warehouse_id, s.active AS sector_active
       FROM customers c
       LEFT JOIN cobranza_sectors s ON s.id = c.sector_id
      WHERE c.id = :id AND c.company_id = :companyId`, { id, companyId: a.companyId }) : [];
  if (!c) throw fail("Cliente no encontrado", 404);
  if (!a.todos && !(c.sector_id && a.sectorIds.includes(c.sector_id))) {
    throw fail("Ese cliente no es de tus sectores", 403);
  }
  return { a, cliente: c };
}

// ── Sectores ─────────────────────────────────────────────────────────────────────────────────

async function listarSectores(req, { incluirInactivos = false, gestion = false } = {}) {
  const a = await alcance(req);
  const sectores = await Q(`
    SELECT s.id, s.name, s.notes, s.active, s.warehouse_id, w.name AS warehouse_name,
           COALESCE(
             (SELECT json_agg(json_build_object('id', e.id, 'name', e.full_name) ORDER BY e.full_name)
                FROM cobranza_sector_employees se JOIN employees e ON e.id = se.employee_id
               WHERE se.sector_id = s.id), '[]') AS employees
      FROM cobranza_sectors s
      LEFT JOIN warehouses w ON w.id = s.warehouse_id
     WHERE s.company_id = :companyId AND ${filtroSector(a, "s.id")}
       ${incluirInactivos ? "" : "AND s.active"}
     ORDER BY s.active DESC, lower(s.name)`, { companyId: a.companyId });

  // Clientes y deuda por sector en una sola pasada: las facturas abiertas de los clientes de
  // estos sectores, con el margen de redondeo de cada una (el mismo con que el cobro la salda).
  const ids = sectores.map(s => s.id);
  const totales = ids.length ? await Q(`
    WITH cli AS (
      SELECT id, sector_id FROM customers
       WHERE company_id = :companyId AND sector_id IN (:ids)
    ), ab AS (
      SELECT cli.sector_id, s.customer_id, ${SALDO_SQL("s")} AS saldo, ${settleToleranceSql("s")} AS tol
        FROM sales s JOIN cli ON cli.id = s.customer_id
       WHERE s.company_id = :companyId AND s.status IN ('pendiente', 'parcial')
    )
    SELECT cli.sector_id,
           COUNT(DISTINCT cli.id)::int AS clientes,
           COUNT(DISTINCT ab.customer_id) FILTER (WHERE ab.saldo > ab.tol)::int AS con_deuda,
           COALESCE(SUM(ab.saldo) FILTER (WHERE ab.saldo > ab.tol), 0)::float AS deuda
      FROM cli LEFT JOIN ab ON ab.customer_id = cli.id
     GROUP BY cli.sector_id`, { companyId: a.companyId, ids }) : [];
  const porSector = new Map(totales.map(t => [t.sector_id, t]));

  // Clientes sin sector: solo para quien ve todo, que es quien los reparte.
  let sinSector = null;
  if (a.todos) {
    const [n] = await Q(`SELECT COUNT(*)::int AS n FROM customers
                          WHERE company_id = :companyId AND sector_id IS NULL AND type = 'cliente'`,
      { companyId: a.companyId });
    sinSector = n?.n || 0;
  }

  // Para el formulario de sectores (solo quien administra): sucursales que venden y usuarios
  // activos, con sus sucursales, para no pedirle además los permisos de Usuarios e Inventario.
  let opciones;
  if (gestion) {
    const [sucursales, usuarios] = await Promise.all([
      Q(`SELECT id, name FROM warehouses WHERE company_id = :companyId AND sells IS NOT FALSE ORDER BY name`, { companyId: a.companyId }),
      Q(`SELECT e.id, e.full_name AS name, r.label AS role_label, r.name AS role,
                COALESCE((SELECT array_agg(ew.warehouse_id) FROM employee_warehouses ew WHERE ew.employee_id = e.id), '{}') AS warehouse_ids
           FROM employees e LEFT JOIN roles r ON r.id = e.role_id
          WHERE e.company_id = :companyId AND e.active ORDER BY e.full_name`, { companyId: a.companyId }),
    ]);
    opciones = { sucursales, usuarios };
  }

  return {
    ...(opciones ? { opciones } : {}),
    data: sectores.map(s => {
      const t = porSector.get(s.id);
      return { ...s, clientes: t?.clientes || 0, con_deuda: t?.con_deuda || 0, deuda: r2(t?.deuda) };
    }),
    sin_sector: sinSector,
    todos: a.todos,
  };
}

async function guardarSector(req, id, body = {}) {
  const companyId = companyOf(req);
  const nombre = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!nombre) throw fail("Ponle un nombre al sector");
  const wid = int(body.warehouse_id);
  const [wh] = wid ? await Q(`SELECT id, name FROM warehouses WHERE id = :wid AND company_id = :companyId`, { wid, companyId }) : [];
  if (!wh) throw fail("Elige la sucursal del sector");
  const empleados = [...new Set((Array.isArray(body.employee_ids) ? body.employee_ids : []).map(int).filter(Boolean))];

  // Quien trabaja el sector tiene que poder operar en su sucursal: el abono y la bolsa se
  // registran contra ella, y sin acceso fallarían en la calle con "No tienes acceso".
  if (empleados.length) {
    const emps = await Q(`SELECT e.id, e.full_name, r.name AS role FROM employees e LEFT JOIN roles r ON r.id = e.role_id
                           WHERE e.id IN (:empleados) AND e.company_id = :companyId`, { empleados, companyId });
    if (emps.length !== empleados.length) throw fail("Uno de los usuarios ya no existe");
    for (const e of emps) {
      if (e.role === "admin") continue;
      const suyas = await employeeWarehouseIds(e.id);
      if (!suyas.includes(wh.id)) throw fail(`${e.full_name} no tiene acceso a la sucursal ${wh.name}. Asígnasela en Usuarios.`);
    }
  }

  const t = await sequelize.transaction();
  try {
    let sectorId = int(id);
    if (sectorId) {
      const [ok] = await sequelize.query(
        `UPDATE cobranza_sectors SET name = :nombre, warehouse_id = :wid, notes = :notes, active = :active
          WHERE id = :sectorId AND company_id = :companyId RETURNING id`,
        { replacements: { nombre, wid: wh.id, notes: body.notes?.trim() || null, active: body.active !== false, sectorId, companyId }, transaction: t, type: Sequelize.QueryTypes.SELECT });
      if (!ok) throw fail("Sector no encontrado", 404);
    } else {
      const [nuevo] = await sequelize.query(
        `INSERT INTO cobranza_sectors (company_id, warehouse_id, name, notes, active)
         VALUES (:companyId, :wid, :nombre, :notes, true) RETURNING id`,
        { replacements: { companyId, wid: wh.id, nombre, notes: body.notes?.trim() || null }, transaction: t, type: Sequelize.QueryTypes.SELECT });
      sectorId = nuevo.id;
    }
    await sequelize.query(`DELETE FROM cobranza_sector_employees WHERE sector_id = :sectorId`, { replacements: { sectorId }, transaction: t });
    if (empleados.length) {
      await sequelize.query(
        `INSERT INTO cobranza_sector_employees (sector_id, employee_id, company_id)
         SELECT :sectorId, unnest(ARRAY[:empleados]::int[]), :companyId`,
        { replacements: { sectorId, empleados, companyId }, transaction: t });
    }
    await t.commit();
    return { data: { id: sectorId } };
  } catch (err) {
    await t.rollback();
    if (err?.parent?.code === "23505") throw fail("Ya hay un sector con ese nombre");
    throw err;
  }
}

/** Pasa clientes a un sector (o los saca, con sector_id null). Solo quien administra. */
async function asignarClientes(req, { sector_id, customer_ids }) {
  const companyId = companyOf(req);
  const ids = [...new Set((Array.isArray(customer_ids) ? customer_ids : []).map(int).filter(Boolean))].slice(0, 500);
  if (!ids.length) throw fail("Elige al menos un cliente");
  const sid = sector_id === null || sector_id === "" ? null : int(sector_id);
  if (sid) {
    const [s] = await Q(`SELECT id FROM cobranza_sectors WHERE id = :sid AND company_id = :companyId`, { sid, companyId });
    if (!s) throw fail("Sector no encontrado", 404);
  }
  const [, n] = await sequelize.query(
    `UPDATE customers SET sector_id = :sid WHERE company_id = :companyId AND id IN (:ids)`,
    { replacements: { sid, companyId, ids } });
  return { data: { updated: n?.rowCount ?? ids.length } };
}

// ── Configuración: qué se deja ───────────────────────────────────────────────────────────────

async function leerConfig(req, { conCategorias = false } = {}) {
  const companyId = companyOf(req);
  const regalos = require("./regalos");
  const ids = await leerLista(PRODUCTS_KEY, companyId);
  const [productos, categorias_regalos] = await Promise.all([
    ids.length ? Q(`SELECT id, name, price::float AS price FROM products WHERE id IN (:ids) AND company_id = :companyId ORDER BY lower(name)`, { ids, companyId }) : [],
    regalos.categoriasRegalos(companyId),
  ]);
  // Para elegir las categorías de los regalos (solo la pantalla de Sectores la pide).
  const categorias = conCategorias
    ? await Q(`SELECT c.id, c.name, (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id) AS productos
                 FROM categories c WHERE c.company_id = :companyId ORDER BY lower(c.name)`, { companyId })
    : undefined;
  return { data: { productos, categorias_regalos, ...(categorias ? { categorias } : {}) } };
}

// Solo se toca la lista que venga: quitar un producto no mueve los regalos, ni al revés. Quitar
// un producto no afecta lo ya dejado: sus facturas siguen por cobrar.
async function guardarConfig(req, { product_ids, regalos_category_ids }) {
  const companyId = companyOf(req);
  const limpia = (lista) => [...new Set((Array.isArray(lista) ? lista : []).map(int).filter(Boolean))];
  if (product_ids !== undefined) {
    const ids = limpia(product_ids);
    const ok = ids.length ? await Q(
      `SELECT id FROM products WHERE id IN (:ids) AND company_id = :companyId AND sellable AND NOT is_variant_parent`,
      { ids, companyId }) : [];
    if (ok.length !== ids.length) throw fail("Elige productos que estén a la venta");
    await guardarLista(PRODUCTS_KEY, companyId, ids);
  }
  if (regalos_category_ids !== undefined) {
    const ids = limpia(regalos_category_ids);
    const ok = ids.length ? await Q(`SELECT id FROM categories WHERE id IN (:ids) AND company_id = :companyId`, { ids, companyId }) : [];
    if (ok.length !== ids.length) throw fail("Categoría no encontrada");
    await guardarLista(GIFT_CATEGORIES_KEY, companyId, ids);
  }
  return leerConfig(req, { conCategorias: true });
}

async function buscarProductos(req, search) {
  const companyId = companyOf(req);
  const term = String(search || "").trim().slice(0, 60);
  if (term.length < 2) return { data: [] };
  const data = await Q(
    `SELECT id, name, price::float AS price FROM products
      WHERE company_id = :companyId AND sellable AND NOT is_variant_parent
        AND (name ILIKE :t OR barcode ILIKE :t)
      ORDER BY lower(name) LIMIT 15`, { companyId, t: `%${term}%` });
  return { data };
}

// ── Clientes de la ruta ──────────────────────────────────────────────────────────────────────

async function listarClientes(req, { sector_id, search } = {}) {
  const a = await alcance(req);
  const rep = { companyId: a.companyId };
  const where = ["c.company_id = :companyId", "c.type = 'cliente'"];
  if (sector_id === "none") {
    if (!a.todos) throw fail("Solo quien ve todos los sectores ve los clientes sin sector", 403);
    where.push("c.sector_id IS NULL");
  } else {
    const sid = int(sector_id);
    if (sid) {
      if (!a.todos && !a.sectorIds.includes(sid)) throw fail("Ese sector no es tuyo", 403);
      where.push("c.sector_id = :sid"); rep.sid = sid;
    } else {
      where.push("c.sector_id IS NOT NULL", filtroSector(a, "c.sector_id"));
    }
  }
  const term = String(search || "").trim().slice(0, 60);
  if (term) {
    where.push("(c.name ILIKE :t OR c.rif ILIKE :t OR c.phone ILIKE :t OR c.address ILIKE :t)");
    rep.t = `%${term}%`;
  }

  // Un sector son decenas o pocos cientos de clientes: una consulta, con la deuda de cada uno.
  const rows = await Q(`
    WITH cli AS (
      SELECT c.id, c.name, c.rif, c.phone, c.address, c.sector_id
        FROM customers c WHERE ${where.join(" AND ")}
       ORDER BY lower(c.name) LIMIT 400
    ), ab AS (
      SELECT s.customer_id, s.created_at, ${SALDO_SQL("s")} AS saldo, ${settleToleranceSql("s")} AS tol
        FROM sales s
       WHERE s.company_id = :companyId AND s.status IN ('pendiente', 'parcial')
         AND s.customer_id IN (SELECT id FROM cli)
    )
    SELECT cli.*, sec.name AS sector_name,
           COALESCE(SUM(ab.saldo) FILTER (WHERE ab.saldo > ab.tol), 0)::float AS deuda,
           COUNT(ab.customer_id) FILTER (WHERE ab.saldo > ab.tol)::int AS abiertas,
           MIN(ab.created_at) FILTER (WHERE ab.saldo > ab.tol) AS desde,
           (SELECT to_char(MAX(COALESCE(p.reference_date, (p.created_at AT TIME ZONE 'America/Caracas')::date)), 'YYYY-MM-DD')
              FROM payments p WHERE p.customer_id = cli.id AND p.amount > 0) AS ultimo_abono
      FROM cli
      LEFT JOIN ab ON ab.customer_id = cli.id
      LEFT JOIN cobranza_sectors sec ON sec.id = cli.sector_id
     GROUP BY cli.id, cli.name, cli.rif, cli.phone, cli.address, cli.sector_id, sec.name
     ORDER BY (COALESCE(SUM(ab.saldo) FILTER (WHERE ab.saldo > ab.tol), 0) > 0) DESC, lower(cli.name)`, rep);

  return { data: rows.map(r => ({ ...r, deuda: r2(r.deuda) })) };
}

/**
 * Ficha del cliente para el cobrador: deuda, facturas abiertas completas (las necesita el modal
 * del cobro conjunto para valorar en bolívares línea por línea) y su historial reciente, que es
 * la tarjeta de papel: cada bolsa dejada y cada abono.
 */
async function fichaCliente(req, customerId) {
  const { a, cliente } = await clienteAlAlcance(req, customerId);
  const getOneSale = require("../sales/getOneSale");

  const abiertas = await Q(`
    SELECT x.id FROM (
      SELECT s.id, s.created_at, ${SALDO_SQL("s")} AS saldo, ${settleToleranceSql("s")} AS tol
        FROM sales s
       WHERE s.company_id = :companyId AND s.customer_id = :cid AND s.status IN ('pendiente', 'parcial')
    ) x WHERE x.saldo > x.tol ORDER BY x.created_at ASC, x.id ASC LIMIT 60`,
    { companyId: a.companyId, cid: cliente.id });
  // El recorte por sucursal de getOneSale no aplica acá: el alcance lo da el sector.
  const facturas = [];
  for (const f of abiertas) facturas.push(await getOneSale(f.id, null));

  const historial = await Q(`
    (SELECT 'bolsa' AS kind, s.id AS sale_id, s.invoice_number, s.total::float AS amount,
            to_char((s.created_at AT TIME ZONE 'America/Caracas')::date, 'YYYY-MM-DD') AS day, s.created_at AS at,
            (SELECT string_agg(trim(to_char(si.quantity, 'FM999990.###')) || ' × ' || si.name, ', ')
               FROM sale_items si WHERE si.sale_id = s.id) AS detail,
            e.full_name AS employee_name, NULL::text AS journal_name, s.status
       FROM sales s LEFT JOIN employees e ON e.id = s.employee_id
      WHERE s.company_id = :companyId AND s.customer_id = :cid
        AND s.status NOT IN ('borrador', 'espera', 'anulado')
      ORDER BY s.created_at DESC LIMIT 40)
    UNION ALL
    (SELECT 'abono', NULL, NULL, SUM(p.amount)::float,
            to_char(MIN(COALESCE(p.reference_date, (p.created_at AT TIME ZONE 'America/Caracas')::date)), 'YYYY-MM-DD'),
            MIN(p.created_at), MIN(p.reference_number),
            MIN(e.full_name), MIN(j.name), NULL
       FROM payments p
       LEFT JOIN employees e ON e.id = p.employee_id
       LEFT JOIN payment_journals j ON j.id = p.payment_journal_id
      WHERE p.company_id = :companyId AND p.customer_id = :cid AND p.amount > 0
      GROUP BY COALESCE(p.batch_id, p.id::text), p.payment_journal_id
      ORDER BY MIN(p.created_at) DESC LIMIT 40)
    UNION ALL
    (SELECT 'regalo', r.sale_id, 'RG-' || lpad(r.number::text, 4, '0'), r.qty::float,
            to_char((COALESCE(r.delivered_at, r.assigned_at) AT TIME ZONE 'America/Caracas')::date, 'YYYY-MM-DD'),
            COALESCE(r.delivered_at, r.assigned_at),
            trim(to_char(r.qty, 'FM999990.###')) || ' × ' || pr.name,
            COALESCE(ed.full_name, ea.full_name), NULL, r.status
       FROM cobranza_regalos r
       JOIN products pr ON pr.id = r.product_id
       LEFT JOIN employees ea ON ea.id = r.assigned_by
       LEFT JOIN employees ed ON ed.id = r.delivered_by
      WHERE r.company_id = :companyId AND r.customer_id = :cid AND r.status <> 'anulado'
      ORDER BY r.assigned_at DESC LIMIT 20)
    ORDER BY day DESC, at DESC LIMIT 60`, { companyId: a.companyId, cid: cliente.id });

  // Lo que se le puede dejar, con el precio de la sucursal del sector (product_stock manda, como
  // al facturar) y lo que queda en existencia.
  const { data: cfg } = await leerConfig(req);
  const productIds = cfg.productos.map(p => p.id);
  const productos = productIds.length && cliente.warehouse_id
    ? await Q(`SELECT p.id, p.name, COALESCE(ps.price, p.price)::float AS price, COALESCE(ps.qty, 0)::float AS stock
                 FROM products p LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid
                WHERE p.id IN (:productIds) ORDER BY lower(p.name)`, { productIds, wid: cliente.warehouse_id })
    : [];

  const { regalos, ganados } = await require("./regalos").deCliente(a.companyId, cliente.id, productIds);

  const deuda = r2(facturas.reduce((s, f) => s + parseFloat(f.balance ?? 0), 0));
  return { data: { cliente, deuda, facturas, historial, productos, regalos, ganados, regalos_activos: cfg.categorias_regalos.length > 0 } };
}

// ── Operaciones del cobrador ─────────────────────────────────────────────────────────────────

/**
 * Deja mercancía a crédito: una factura por visita, con los productos configurados que se
 * elijan, desde la sucursal del sector. La factura se numera en el acto (confirmCreditSale): es
 * una deuda pactada y tiene que aparecer en Cuentas por cobrar y en el cierre.
 */
async function dejarBolsa(req, customerId, { items, idempotency_key } = {}) {
  const { a, cliente } = await clienteAlAlcance(req, customerId);
  if (!cliente.sector_id) throw fail("Asígnale un sector al cliente antes de dejarle mercancía");
  if (!cliente.sector_active) throw fail("El sector de este cliente está inactivo");
  const lineas = (Array.isArray(items) ? items : []).map(i => ({ product_id: int(i?.product_id), quantity: int(i?.qty) }));
  if (!lineas.length) throw fail("Elige qué se deja");
  if (new Set(lineas.map(l => l.product_id)).size !== lineas.length) throw fail("Un producto está repetido");
  for (const l of lineas) {
    if (!l.quantity || l.quantity < 1 || l.quantity > MAX_BOLSAS) throw fail(`La cantidad va de 1 a ${MAX_BOLSAS}`);
  }

  const permitidos = await leerLista(PRODUCTS_KEY, a.companyId);
  if (!permitidos.length) throw fail("Falta elegir qué productos se dejan (Cobranza → Sectores)");
  if (lineas.some(l => !permitidos.includes(l.product_id))) throw fail("Ese producto no está entre los que deja el cobrador");

  const wid = cliente.warehouse_id;
  // La serie: la del usuario en esa sucursal o la primera de facturas activa (como la agenda).
  const propias = req.employee?.id ? await UserSerie.findAll({ where: { user_id: req.employee.id }, attributes: ["serie_id"] }) : [];
  const deFactura = { warehouse_id: wid, active: true, type: "factura" };
  const serie = (propias.length && await Serie.findOne({
    where: { ...deFactura, id: { [Op.in]: propias.map(s => s.serie_id) } }, order: [["id", "ASC"]],
  })) || await Serie.findOne({ where: deFactura, order: [["id", "ASC"]] });
  if (!serie) throw fail("La sucursal del sector no tiene una serie de facturas activa");

  // Moneda de la factura: la local si está activa, con la tasa de hoy (igual que la caja).
  const local = await Currency.findOne({ where: { is_base: false, active: true }, order: [["id", "ASC"]] });

  const createSale = require("../sales/createSale");
  const confirmCreditSale = require("../sales/confirmCreditSale");
  const venta = await createSale({
    items: lineas,
    paid: 0,
    employee_id: req.employee?.id || null,
    customer_id: cliente.id,
    serie_id: serie.id,
    warehouse_id: wid,
    currency_id: local?.id || null,
    exchange_rate: local ? parseFloat(local.exchange_rate) : 1,
    idempotency_key: idempotency_key ? String(idempotency_key).slice(0, 100) : undefined,
  }, req);
  const saleId = venta?.id ?? venta?.data?.id;
  if (!saleId) throw fail("No se pudo registrar lo que se dejó", 500);

  // Un reintento devuelve la venta ya creada (idempotencia) y quizás ya numerada.
  if (["borrador", "espera"].includes(venta.status)) await confirmCreditSale(saleId, req);
  const [hecha] = await Q(`SELECT id, invoice_number, total::float AS total, status FROM sales WHERE id = :id AND company_id = :companyId`,
    { id: saleId, companyId: a.companyId });
  return { data: { ...hecha, stock_negativo: venta.stock_negativo || [] } };
}

/**
 * Abono: cobro conjunto de facturas ABIERTAS de este cliente. El cuerpo es el mismo del cobro
 * conjunto de siempre (lo arma BulkPaymentModal); acá solo se comprueba que las facturas sean
 * del cliente y que el cliente sea de los sectores de quien cobra.
 */
async function abonar(req, customerId, body = {}) {
  const { a, cliente } = await clienteAlAlcance(req, customerId);
  const ids = [...new Set((body.sale_ids || []).map(int).filter(Boolean))];
  if (!ids.length) throw fail("No hay facturas que abonar");
  const [n] = await Q(`SELECT COUNT(*)::int AS n FROM sales
                        WHERE id IN (:ids) AND company_id = :companyId AND customer_id = :cid
                          AND status IN ('pendiente', 'parcial')`, { ids, companyId: a.companyId, cid: cliente.id });
  if ((n?.n || 0) !== ids.length) throw fail("Alguna factura ya no está abierta o no es de este cliente. Vuelve a abrir la ficha.");
  const createBulkPayment = require("../payments/createBulkPayment");
  return createBulkPayment({ ...body, sale_ids: ids, employee_id: req.employee?.id || null }, req);
}

module.exports = {
  alcance, clienteAlAlcance, listarSectores, guardarSector, asignarClientes,
  leerConfig, guardarConfig, buscarProductos,
  listarClientes, fichaCliente, dejarBolsa, abonar,
};
