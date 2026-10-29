const { DiningTable, DiningArea, Company, Setting, Currency, Sale, SaleItem, KitchenTicket, KitchenTicketItem, Sequelize } = require("../models");
const { runWithoutTenant } = require("../utils/tenantStorage");

const { Op } = Sequelize;

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

/** Lo que ve el cliente al escanear el QR. */
async function ver(token) {
  return runWithoutTenant(async () => {
    const { mesa, company } = await mesaDe(token);
    const cid = company.id;
    const area = await DiningArea.findByPk(mesa.area_id, { attributes: ["name"] });

    const ajustes = Object.fromEntries((await Setting.findAll({
      where: { company_id: cid, key: { [Op.in]: ["store_name", "logo_filename", SLUG_KEY] } },
      attributes: ["key", "value"],
    })).map(s => [s.key, s.value]));
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
  return ver(token);
}

module.exports = { ver, pedirCuenta };
