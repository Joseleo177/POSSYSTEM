const { DiningTable, DiningArea, Company, Setting, Currency, Sale, SaleItem, KitchenTicket, KitchenTicketItem, TableOrder, Product, sequelize, Sequelize } = require("../models");
const { runWithoutTenant } = require("../utils/tenantStorage");
const { huella, olvidar } = require("../utils/huella");

const { Op } = Sequelize;
// Color en hex de seis dígitos o nada: termina en una variable CSS del navegador del cliente.
const colorDe = (raw) => (/^#?[0-9a-fA-F]{6}$/.test(String(raw || "").trim()) ? String(raw).trim() : null);

// La página del QR de la mesa (/mesa/<código>): lo que el cliente ve desde su teléfono, sin
// sesión. Cómo va cada ronda en la cocina, lo que lleva pedido y cuánto va la cuenta, y un
// botón para pedirla. Solo se muestra la cuenta ABIERTA de esa mesa: nada de nombres, notas
// del personal, costos ni cuentas ya cobradas (el QR se queda en la mesa para el siguiente).
//
// El código es secreto por mesa (dining_tables.public_token): sin él no se llega a nada.

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

// Cuentas que siguen en la mesa: la que el mesonero va armando ('espera'), un borrador, y el
// pedido del catálogo hecho en la mesa que todavía no se acepta.
const ABIERTAS = ["espera", "borrador", "pedido"];
const SLUG_KEY = "public_catalog_slug";

// Pedir desde el QR (Configuración → Punto de venta → Cocina): 'confirmar' —el de fábrica: el
// mesonero lo acepta antes de que vaya a cocina, así una foto del QR desde la calle no manda
// pedidos falsos—, 'directo' o 'apagado'.
const MODO_KEY = "mesa_qr_pedidos";
const leerModo = (v) => (["directo", "apagado"].includes(v) ? v : "confirmar");
const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

async function mesaDe(token) {
  const t = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{12,32}$/.test(t)) throw fail("Este código de mesa no es válido", 404);
  const mesa = await DiningTable.findOne({ where: { public_token: t, active: true } });
  if (!mesa) throw fail("Esta mesa ya no existe", 404);
  const company = await Company.findByPk(mesa.company_id, { attributes: ["id", "name", "active", "cocina_enabled", "catalog_enabled"] });
  if (!company?.active || !company.cocina_enabled) throw fail("Esta mesa no está disponible", 404);
  return { mesa, company };
}

// Huella de la mesa (ver utils/huella.js): todo lo que la página pinta —cuentas, total, la
// cuenta pedida, cada ronda y su estado, las líneas y la tasa del día— en una sola consulta por
// índice. Varios teléfonos de la misma mesa comparten la huella durante 3 s.
const HUELLA_SQL = `
  SELECT md5(
    COALESCE((SELECT string_agg(s.id || ':' || s.total || ':' || s.status || ':' || COALESCE(extract(epoch FROM s.bill_requested_at)::bigint, 0), ',' ORDER BY s.id)
                FROM sales s WHERE s.table_id = t.id AND s.company_id = t.company_id AND s.status IN ('espera', 'borrador', 'pedido')), '')
    || '|' ||
    COALESCE((SELECT string_agg(k.id || ':' || k.status, ',' ORDER BY k.id)
                FROM kitchen_tickets k JOIN sales s ON s.id = k.sale_id
               WHERE s.table_id = t.id AND s.company_id = t.company_id AND s.status IN ('espera', 'borrador', 'pedido')), '')
    || '|' ||
    COALESCE((SELECT count(*) || ':' || COALESCE(max(si.id), 0)
                FROM sale_items si JOIN sales s ON s.id = si.sale_id
               WHERE s.table_id = t.id AND s.company_id = t.company_id AND s.status IN ('espera', 'borrador', 'pedido')), '')
    || '|' ||
    COALESCE((SELECT string_agg(cu.exchange_rate::text, ',' ORDER BY cu.id) FROM currencies cu
               WHERE cu.company_id = t.company_id AND cu.active), '')
    || '|' ||
    COALESCE((SELECT string_agg(o.id || ':' || o.status, ',' ORDER BY o.id) FROM table_orders o
               WHERE o.table_id = t.id AND o.created_at > NOW() - INTERVAL '3 hours'), '')
    || '|' ||
    COALESCE((SELECT st.value FROM settings st WHERE st.company_id = t.company_id AND st.key = 'mesa_qr_pedidos'), '')
  ) AS v
    FROM dining_tables t
   WHERE t.public_token = :token AND t.active`;

/** Lo que ve el cliente al escanear el QR. Con `v` (su huella) y sin cambios: { unchanged }. */
async function ver(token, v = null) {
  if (v && /^[A-Za-z0-9_-]{12,32}$/.test(String(token || ""))) {
    const actual = await huella(`mesa:${token}`, HUELLA_SQL, { token: String(token) }, 3000);
    if (actual === v) return { unchanged: true, v: actual };
  }
  const datos = await armar(token);
  datos.v = await huella(`mesa:${token}`, HUELLA_SQL, { token: String(token) }, 3000);
  return datos;
}

async function armar(token) {
  return runWithoutTenant(async () => {
    const { mesa, company } = await mesaDe(token);
    const cid = company.id;
    const area = await DiningArea.findByPk(mesa.area_id, { attributes: ["name"] });

    const ajustes = Object.fromEntries((await Setting.findAll({
      where: { company_id: cid, key: { [Op.in]: ["store_name", "logo_filename", "brand_color", "catalog_brand_color", SLUG_KEY, MODO_KEY] } },
      attributes: ["key", "value"],
    })).map(s => [s.key, s.value]));
    // Pedidos que el cliente hizo desde el QR y que todavía no son una ronda: los que esperan
    // al mesonero y los rechazados de la última media hora (con el motivo).
    const pedidosQr = await TableOrder.findAll({
      where: {
        table_id: mesa.id,
        [Op.or]: [
          { status: "pendiente", created_at: { [Op.gt]: new Date(Date.now() - 3 * 3600e3) } },
          { status: "rechazado", resolved_at: { [Op.gt]: new Date(Date.now() - 30 * 60e3) } },
        ],
      },
      attributes: ["id", "status", "summary", "estimate", "reason", "created_at"],
      order: [["created_at", "ASC"]],
    });
    const monedas = await Currency.findAll({ where: { company_id: cid, active: true }, attributes: ["code", "symbol", "exchange_rate", "is_base"] });
    const base = monedas.find(m => m.is_base);
    const bs = monedas.find(m => !m.is_base && /^(VES|VED|BS)/i.test(m.code || ""));

    const ventas = await Sale.findAll({
      where: { company_id: cid, table_id: mesa.id, status: { [Op.in]: ABIERTAS } },
      attributes: ["id", "total", "status", "created_at", "bill_requested_at"],
      order: [["created_at", "ASC"]],
    });
    const ids = ventas.map(v => v.id);

    const lineas = ids.length ? await SaleItem.findAll({
      where: { sale_id: { [Op.in]: ids } },
      attributes: ["name", "quantity", "price", "discount", "note"],
      order: [["id", "ASC"]],
    }) : [];
    const rondas = ids.length ? await KitchenTicket.findAll({
      where: { sale_id: { [Op.in]: ids } },
      attributes: ["id", "round_no", "status", "created_at", "status_at", "ready_at"],
      order: [["created_at", "ASC"], ["id", "ASC"]],
    }) : [];
    const items = rondas.length ? await KitchenTicketItem.findAll({
      where: { ticket_id: { [Op.in]: rondas.map(r => r.id) } },
      attributes: ["ticket_id", "name", "quantity", "modifiers"],
      order: [["id", "ASC"]],
    }) : [];

    // Lo pedido, agrupado por nombre: "2 × Lomo apanado". Las líneas a 0 (contornos incluidos)
    // ya se leen en su plato y no van.
    const pedido = new Map();
    for (const l of lineas) {
      const precio = parseFloat(l.price) - parseFloat(l.discount || 0);
      if (!(parseFloat(l.price) > 0)) continue;
      const k = `${l.name}|${precio.toFixed(5)}`;
      const prev = pedido.get(k) || { name: l.name, quantity: 0, subtotal: 0 };
      prev.quantity += parseFloat(l.quantity);
      prev.subtotal += precio * parseFloat(l.quantity);
      pedido.set(k, prev);
    }
    const total = round2(ventas.reduce((a, v) => a + parseFloat(v.total || 0), 0));
    const tasa = bs ? parseFloat(bs.exchange_rate) || null : null;

    return {
      data: {
        store: {
          name: ajustes.store_name || company.name,
          logo_url: ajustes.logo_filename
            ? (ajustes.logo_filename.startsWith("http") ? ajustes.logo_filename : `/uploads/${ajustes.logo_filename}`)
            : null,
          menu_url: company.catalog_enabled && ajustes[SLUG_KEY] ? `/catalogo/${ajustes[SLUG_KEY]}` : null,
          // El color de la tienda, el mismo que pinta su catálogo: sin él la página de la mesa
          // salía en el rosa de NXUS. Se valida como en el catálogo: va a una variable CSS.
          brand_color: colorDe(ajustes.catalog_brand_color) || colorDe(ajustes.brand_color),
        },
        table: { name: mesa.name, area: area?.name || null },
        open: ventas.length > 0,
        opened_at: ventas[0]?.created_at || null,
        bill_requested: ventas.length > 0 && ventas.every(v => v.bill_requested_at),
        rounds: rondas.map((r, i) => ({
          n: i + 1,
          status: r.status,
          sent_at: r.created_at,
          ready_at: r.ready_at,
          items: items.filter(it => it.ticket_id === r.id).map(it => ({
            name: it.name, quantity: parseFloat(it.quantity), modifiers: it.modifiers || null,
          })),
        })),
        lines: [...pedido.values()].map(p => ({ name: p.name, quantity: p.quantity, subtotal: round2(p.subtotal) })),
        total,
        currency: { symbol: base?.symbol || "Ref.", bs_symbol: bs?.symbol || null, bs_rate: tasa },
        // Si se puede pedir desde el QR: 'confirmar' (lo acepta el mesonero) o 'directo'.
        ordering: leerModo(ajustes[MODO_KEY]) === "apagado" ? null : leerModo(ajustes[MODO_KEY]),
        qr_orders: pedidosQr.map(o => ({
          id: o.id, status: o.status, summary: o.summary, estimate: parseFloat(o.estimate), reason: o.reason, created_at: o.created_at,
        })),
      },
    };
  });
}

/** El cliente pide la cuenta desde su teléfono: queda marcada como si la pidiera al mesonero. */
async function pedirCuenta(token) {
  await runWithoutTenant(async () => {
    const { mesa, company } = await mesaDe(token);
    const ventas = await Sale.findAll({
      where: { company_id: company.id, table_id: mesa.id, status: { [Op.in]: ["espera", "borrador"] } },
      attributes: ["id", "bill_requested_at"],
    });
    if (!ventas.length) throw fail("Esta mesa no tiene una cuenta abierta", 409);
    await Sale.update(
      { bill_requested_at: new Date() },
      { where: { id: { [Op.in]: ventas.filter(v => !v.bill_requested_at).map(v => v.id) } } },
    );
  });
  olvidar(`mesa:${token}`);
  return ver(token);
}

// ── Pedir desde el QR ─────────────────────────────────────────────────────────────────────

async function mesaConPedidos(token) {
  const { mesa, company } = await mesaDe(token);
  const area = await DiningArea.findByPk(mesa.area_id, { attributes: ["warehouse_id"] });
  const ajuste = await Setting.findOne({ where: { company_id: company.id, key: MODO_KEY }, attributes: ["value"] });
  const modo = leerModo(ajuste?.value);
  if (modo === "apagado") throw fail("Esta mesa no recibe pedidos desde el QR: pídele al mesonero", 403);
  return { mesa, company, wid: area.warehouse_id, modo };
}

// El menú cambia poco y lo piden todos los teléfonos del local: se guarda 60 s por sucursal. Un
// plato que se acaba puede tardar ese minuto en salir como agotado; el mesonero lo ve al
// aceptar, y en el modo directo la venta lo rechaza igual que en la caja.
const menus = new Map();   // `${cid}:${wid}` → { at, data }
const MENU_TTL = 60_000;

/** El menú de la sucursal de la mesa: lo que se vende, con precio de la sucursal y agotados. */
async function menu(token) {
  return runWithoutTenant(async () => {
    const { company, wid } = await mesaConPedidos(token);
    const clave = `${company.id}:${wid}`;
    const h = menus.get(clave);
    if (h && Date.now() - h.at < MENU_TTL) return { data: h.data };

    const filas = await sequelize.query(`
      SELECT p.id, p.name, p.short_description, p.image_filename, p.unit, p.is_combo, p.is_service,
             COALESCE(ps.price, p.price) AS price, ps.qty, c.id AS category_id, c.name AS category_name,
             EXISTS (SELECT 1 FROM product_modifier_groups pmg JOIN modifier_groups mg ON mg.id = pmg.group_id AND mg.active
                      WHERE pmg.product_id = p.id) AS has_addons
        FROM products p
        LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid
        LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.company_id = :cid AND p.sellable = true AND p.is_addon = false
         AND p.is_variant_parent = false AND p.piece_mode IS NULL
         AND (ps.product_id IS NOT NULL
              OR ((p.is_service OR p.is_combo) AND NOT EXISTS (SELECT 1 FROM product_stock x WHERE x.product_id = p.id)))
         AND COALESCE(ps.price, p.price) > 0
       ORDER BY c.name NULLS LAST, p.name`,
      { replacements: { cid: company.id, wid }, type: Sequelize.QueryTypes.SELECT });

    const data = filas.map(p => ({
      id: p.id,
      name: p.name,
      description: p.short_description || null,
      image_url: p.image_filename ? (p.image_filename.startsWith("http") ? p.image_filename : `/uploads/${p.image_filename}`) : null,
      category: p.category_name || "Otros",
      price: round2(p.price),
      has_addons: !!p.has_addons,
      // Un plato (servicio o con receta) no se agota por inventario en el restaurante; un
      // producto de reventa (el refresco) sí, con su existencia en la sucursal.
      agotado: !(p.is_service || p.is_combo) && !(parseFloat(p.qty) > 0),
    }));
    if (menus.size > 200) menus.delete(menus.keys().next().value);
    menus.set(clave, { at: Date.now(), data });
    return { data };
  });
}

/** Los adicionales de un plato (término, contornos, extras), sin existencias internas. */
async function adicionales(token, productId) {
  return runWithoutTenant(async () => {
    const { company, wid } = await mesaConPedidos(token);
    const p = await Product.findOne({ where: { id: parseInt(productId, 10) || 0, company_id: company.id, sellable: true }, attributes: ["id"] });
    if (!p) throw fail("Ese plato ya no está en el menú", 404);
    return { data: await require("./addons").forProduct(p.id, wid, false) };
  });
}

const MAX_LINEAS = 30;
const MAX_CANT = 20;
const MAX_PENDIENTES = 3;

/**
 * El cliente manda su pedido: { items: [{ product_id, qty, note, options }], note }. Se valida
 * igual que una ronda del mesonero (productos, cantidades enteras, adicionales obligatorios y
 * agotados) y se guarda. En el modo 'directo' sale a cocina en el acto, por el mismo camino.
 */
async function pedir(token, body = {}) {
  let directo = null;
  await runWithoutTenant(async () => {
    const { mesa, company, wid, modo } = await mesaConPedidos(token);
    const cid = company.id;

    const raw = Array.isArray(body.items) ? body.items : [];
    if (!raw.length) throw fail("Tu pedido está vacío");
    if (raw.length > MAX_LINEAS) throw fail(`Hasta ${MAX_LINEAS} platos por pedido`);
    const lineas = raw.map(l => ({
      product_id: parseInt(l.product_id, 10),
      qty: Number(l.qty),
      note: String(l.note || "").replace(/[\r\n]+/g, " ").trim().slice(0, 120) || null,
      options: (Array.isArray(l.options) ? l.options : []).map(o => parseInt(o, 10)).filter(Number.isInteger).slice(0, 12),
    }));
    if (lineas.some(l => !Number.isInteger(l.product_id) || !Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_CANT)) {
      throw fail(`Cantidad no válida: de 1 a ${MAX_CANT} por plato`);
    }

    // Contra los pedidos en cadena: una foto del QR no debe poder llenar la cola del mesonero.
    const pendientes = await TableOrder.count({ where: { table_id: mesa.id, status: "pendiente" } });
    if (pendientes >= MAX_PENDIENTES) throw fail("Ya tienes pedidos esperando al mesonero. Espera a que los confirme.", 429);

    const ids = [...new Set(lineas.map(l => l.product_id))];
    const productos = await sequelize.query(`
      SELECT p.id, p.name, p.is_addon, p.is_variant_parent, p.is_service, p.is_combo, COALESCE(ps.price, p.price) AS price, ps.qty
        FROM products p LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid
       WHERE p.company_id = :cid AND p.id IN (:ids) AND p.sellable = true`,
      { replacements: { cid, wid, ids }, type: Sequelize.QueryTypes.SELECT });
    const porId = new Map(productos.map(p => [p.id, p]));
    const { resolver } = require("./addons");
    let estimado = 0;
    const resumen = [];
    for (const l of lineas) {
      const p = porId.get(l.product_id);
      if (!p || p.is_addon || p.is_variant_parent) throw fail("Uno de los platos ya no está en el menú. Recarga la página.");
      if (!(p.is_service || p.is_combo) && !(parseFloat(p.qty) >= l.qty)) throw fail(`"${p.name}" se acabó`);
      const r = await resolver(p.id, l.options, { warehouseId: wid, nombrePlato: p.name });
      const extras = r.extras.length ? await sequelize.query(`
        SELECT COALESCE(ps.price, p.price) AS price FROM products p
          LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = :wid
         WHERE p.id IN (:ids)`,
        { replacements: { wid, ids: r.extras.map(e => e.product_id) }, type: Sequelize.QueryTypes.SELECT }) : [];
      estimado += l.qty * (round2(p.price) + extras.reduce((a, e) => a + round2(e.price), 0));
      resumen.push(`${l.qty} × ${p.name}${r.cocina ? ` (${r.cocina})` : ""}`);
    }

    const pedido = await TableOrder.create({
      company_id: cid, table_id: mesa.id, warehouse_id: wid,
      items: lineas, summary: resumen.join(", ").slice(0, 500), estimate: round2(estimado),
      note: String(body.note || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200) || null,
    });
    if (modo === "directo") directo = { id: pedido.id, cid };
    // El mesonero lo ve en la siguiente vuelta del mapa, sin esperar el caché de la huella.
    olvidar(`mesas:${cid}:`);
  });

  // Directo: lo acepta "el sistema", fuera del bloque sin tenant (la ronda necesita el de la empresa).
  if (directo) await require("./pedidosQr").aceptarComoSistema(directo.id, directo.cid);
  olvidar(`mesa:${token}`);
  return ver(token);
}

module.exports = { ver, pedirCuenta, menu, adicionales, pedir, MODO_KEY, leerModo };
