const { DiningArea, DiningTable, Sale, sequelize, Sequelize } = require("../models");
const { visibleWarehouseIds, assertWarehouseAccess } = require("../middleware/auth");

const { Op } = Sequelize;

// Mapa de mesas. Aquí vive el plano —áreas y mesas de cada sucursal—; la ocupación no se
// guarda: una mesa está ocupada mientras tenga una cuenta abierta (sales.table_id), y eso lo
// lee la caja del listado de cuentas en espera que ya consulta.

// Cuadrícula del plano (ver migración 20261031110000-mesas).
const COLS = 40;
const ROWS = 24;
const SHAPES = ["square", "round", "rect"];
const GIROS = [0, 45, 90, 135];
// Una cuenta sigue en la mesa mientras no se cobre: en espera, o en borrador mientras la
// caja la está cobrando.
const ABIERTA = ["espera", "borrador"];

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

const int = (v) => (Number.isInteger(Number(v)) ? Number(v) : NaN);

async function areasDe(warehouseIds, transaction) {
  const where = { active: true };
  if (warehouseIds) where.warehouse_id = { [Op.in]: warehouseIds };
  const areas = await DiningArea.findAll({
    where,
    include: [{ model: DiningTable, as: "tables", where: { active: true }, required: false }],
    order: [["sort_order", "ASC"], ["id", "ASC"], [{ model: DiningTable, as: "tables" }, "id", "ASC"]],
    transaction,
  });
  return areas.map(a => a.toJSON());
}

/** Áreas con sus mesas, de una sucursal o de todas las que el empleado puede ver. */
async function listAreas(req, { warehouse_id } = {}) {
  const wid = parseInt(warehouse_id, 10);
  if (wid) {
    await assertWarehouseAccess(req, wid);
    return { data: await areasDe([wid]) };
  }
  const visibles = await visibleWarehouseIds(req);
  if (Array.isArray(visibles) && !visibles.length) return { data: [] };
  return { data: await areasDe(visibles) };
}

async function saveArea(req, { id, warehouse_id, name } = {}) {
  const nombre = String(name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!nombre) throw fail("Ponle nombre al área");

  if (id) {
    const area = await DiningArea.findOne({ where: { id: int(id), active: true } });
    if (!area) throw fail("Área no encontrada", 404);
    await assertWarehouseAccess(req, area.warehouse_id);
    await area.update({ name: nombre });
    return { data: area.toJSON() };
  }

  const wid = parseInt(warehouse_id, 10);
  if (!wid) throw fail("Elige la sucursal del área");
  await assertWarehouseAccess(req, wid);
  const { Warehouse } = require("../models");
  const almacen = await Warehouse.findOne({ where: { id: wid, active: true }, attributes: ["id"] });
  if (!almacen) throw fail("Sucursal no encontrada", 404);

  const ultimo = await DiningArea.max("sort_order", { where: { warehouse_id: wid, active: true } });
  const area = await DiningArea.create({
    warehouse_id: wid, name: nombre, sort_order: (ultimo ?? -1) + 1, company_id: req.company_id,
  });
  return { data: { ...area.toJSON(), tables: [] } };
}

// Mesas de la lista que tienen una cuenta sin cobrar. Una mesa así no se quita del plano:
// la cuenta quedaría colgando de una mesa que nadie ve.
async function mesasConCuenta(tableIds, transaction) {
  if (!tableIds.length) return [];
  const rows = await Sale.findAll({
    where: { table_id: { [Op.in]: tableIds }, status: { [Op.in]: ABIERTA } },
    attributes: ["table_id"],
    transaction,
  });
  return [...new Set(rows.map(r => r.table_id))];
}

async function deleteArea(req, id) {
  const area = await DiningArea.findOne({
    where: { id: int(id), active: true },
    include: [{ model: DiningTable, as: "tables", where: { active: true }, required: false }],
  });
  if (!area) throw fail("Área no encontrada", 404);
  await assertWarehouseAccess(req, area.warehouse_id);

  const ocupadas = await mesasConCuenta(area.tables.map(t => t.id));
  if (ocupadas.length) {
    const nombres = area.tables.filter(t => ocupadas.includes(t.id)).map(t => t.name).join(", ");
    throw fail(`No se puede quitar el área: ${nombres} ${ocupadas.length === 1 ? "tiene" : "tienen"} una cuenta abierta`);
  }

  // Se desactiva, no se borra: las ventas ya cobradas siguen diciendo en qué mesa fueron.
  await sequelize.transaction(async (transaction) => {
    await DiningTable.update({ active: false }, { where: { area_id: area.id }, transaction });
    await area.update({ active: false }, { transaction });
  });
  return { data: { id: area.id } };
}

/**
 * Guarda el plano entero de un área de una vez. El editor trabaja en la pantalla y manda la
 * lista final: las mesas con id se actualizan, las nuevas se crean y las que faltan se
 * desactivan (si no tienen una cuenta abierta).
 */
async function saveLayout(req, areaId, { tables } = {}) {
  const area = await DiningArea.findOne({ where: { id: int(areaId), active: true } });
  if (!area) throw fail("Área no encontrada", 404);
  await assertWarehouseAccess(req, area.warehouse_id);
  if (!Array.isArray(tables)) throw fail("Plano no válido");
  if (tables.length > 200) throw fail("Un área admite hasta 200 mesas");

  const limpias = tables.map((t, i) => {
    const name = String(t.name || "").trim().replace(/\s+/g, " ").slice(0, 20);
    if (!name) throw fail(`A la mesa ${i + 1} le falta el nombre`);
    const seats = int(t.seats);
    const shape = SHAPES.includes(t.shape) ? t.shape : null;
    const [x, y, w, h] = [t.x, t.y, t.w, t.h].map(int);
    const rotation = GIROS.includes(int(t.rotation)) ? int(t.rotation) : 0;
    if (!(seats >= 1 && seats <= 99)) throw fail(`${name}: los puestos van de 1 a 99`);
    if (!shape) throw fail(`${name}: forma no válida`);
    if (!(w >= 2 && w <= 12 && h >= 2 && h <= 12)) throw fail(`${name}: tamaño no válido`);
    if (!(x >= 0 && y >= 0 && x + w <= COLS && y + h <= ROWS)) throw fail(`${name} se sale del plano`);
    return { id: t.id ? int(t.id) : null, name, seats, shape, rotation, x, y, w, h };
  });

  return sequelize.transaction(async (transaction) => {
    // El nombre es lo que se canta en el salón y lo que ve la cocina: no puede repetirse
    // en la sucursal, ni siquiera en otra área.
    const otras = await DiningTable.findAll({
      where: { active: true, area_id: { [Op.ne]: area.id } },
      include: [{ model: DiningArea, as: "area", where: { warehouse_id: area.warehouse_id, active: true }, attributes: [] }],
      attributes: ["name"],
      transaction,
    });
    const usados = new Set(otras.map(t => t.name.toLowerCase()));
    for (const t of limpias) {
      const k = t.name.toLowerCase();
      if (usados.has(k)) throw fail(`Ya hay una mesa llamada "${t.name}" en esta sucursal`);
      usados.add(k);
    }

    const actuales = await DiningTable.findAll({ where: { area_id: area.id, active: true }, transaction });
    const porId = new Map(actuales.map(t => [t.id, t]));
    for (const t of limpias) {
      if (t.id && !porId.has(t.id)) throw fail(`La mesa "${t.name}" ya no existe en esta área. Recarga el plano.`);
    }

    const quedan = new Set(limpias.filter(t => t.id).map(t => t.id));
    const quitar = actuales.filter(t => !quedan.has(t.id));
    const ocupadas = await mesasConCuenta(quitar.map(t => t.id), transaction);
    if (ocupadas.length) {
      const nombres = quitar.filter(t => ocupadas.includes(t.id)).map(t => t.name).join(", ");
      throw fail(`No se puede quitar ${nombres}: ${ocupadas.length === 1 ? "tiene" : "tienen"} una cuenta abierta`);
    }
    if (quitar.length) {
      await DiningTable.update({ active: false }, { where: { id: { [Op.in]: quitar.map(t => t.id) } }, transaction });
    }

    for (const t of limpias) {
      const { id, ...campos } = t;
      if (id) await porId.get(id).update(campos, { transaction });
      else await DiningTable.create({ ...campos, area_id: area.id, company_id: req.company_id }, { transaction });
    }

    return { data: await areasDe([area.warehouse_id], transaction) };
  });
}

/**
 * Valida la mesa de una cuenta: de esta empresa (el filtro de tenant ya lo impone), activa y
 * de la misma sucursal que la venta. Para createSale y updateSale.
 */
async function assertTable(tableId, warehouseId, transaction) {
  const t = await DiningTable.findOne({
    where: { id: int(tableId), active: true },
    include: [{ model: DiningArea, as: "area", attributes: ["warehouse_id", "active"] }],
    transaction,
  });
  if (!t || !t.area?.active) throw fail("La mesa ya no existe en el plano");
  if (warehouseId && parseInt(t.area.warehouse_id, 10) !== parseInt(warehouseId, 10)) {
    throw fail("La mesa es de otra sucursal");
  }
  return t;
}

// ── Ocupación y rondas (mesonero) ───────────────────────────────────────────────────────

const QT = Sequelize.QueryTypes;
// Peso y volumen admiten decimales; lo demás se cuenta por unidades enteras (mismo criterio
// que helpers/unitFormatter.js en el frontend).
const UNIDADES_FRACCIONABLES = ["KG", "KILOGRAMO", "L", "LITRO", "M", "METRO", "M2"];

/**
 * Cuentas abiertas con mesa de una sucursal: lo que pinta el mapa. Una sola consulta liviana,
 * sin líneas ni totales del pie, porque la pantalla del mesonero la repite cada pocos segundos.
 */
async function occupancy(req, { warehouse_id } = {}) {
  const wid = parseInt(warehouse_id, 10);
  if (!wid) throw fail("Elige la sucursal");
  await assertWarehouseAccess(req, wid);
  const data = await sequelize.query(`
    SELECT s.id, s.table_id, s.total, s.created_at, s.kitchen_status, s.status, s.bill_requested_at,
           c.name AS customer_name, COALESCE(w.full_name, e.full_name) AS waiter_name,
           s.held_by_employee_id
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN employees w ON w.id = s.waiter_id
      LEFT JOIN employees e ON e.id = s.employee_id
     WHERE s.company_id = :cid AND s.warehouse_id = :wid
       AND s.table_id IS NOT NULL
       AND s.status IN ('espera', 'borrador')
     ORDER BY s.created_at`, { replacements: { cid: req.company_id, wid }, type: QT.SELECT });
  return { data };
}

// Cuentas abiertas de una mesa, con la venta bloqueada o no.
async function cuentasDeMesa(tableId, transaction) {
  return Sale.findAll({
    where: { table_id: tableId, status: { [Op.in]: ABIERTA } },
    order: [["created_at", "ASC"]],
    transaction,
  });
}

/** Lo que el mesonero ve al abrir una mesa: sus cuentas, con las líneas y cada ronda enviada. */
async function accounts(req, tableId) {
  const mesa = await assertTable(tableId);
  await assertWarehouseAccess(req, mesa.area.warehouse_id);
  const ventas = await cuentasDeMesa(mesa.id);
  if (!ventas.length) return { data: { table: mesa.toJSON(), accounts: [] } };

  const ids = ventas.map(v => v.id);
  const [lineas, rondas] = await Promise.all([
    sequelize.query(`
      SELECT si.sale_id, si.id, si.product_id, si.name, si.quantity, si.price, si.subtotal, si.note,
             p.unit, COALESCE(p.is_addon, false) AS is_addon
        FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
       WHERE si.sale_id IN (:ids) ORDER BY si.id`, { replacements: { ids }, type: QT.SELECT }),
    sequelize.query(`
      SELECT k.id, k.sale_id, k.round_no, k.status, k.created_at, k.note, e.full_name AS waiter_name,
             (SELECT json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'note', i.note, 'modifiers', i.modifiers) ORDER BY i.id)
                FROM kitchen_ticket_items i WHERE i.ticket_id = k.id) AS items
        FROM kitchen_tickets k
        LEFT JOIN employees e ON e.id = k.waiter_id
       WHERE k.sale_id IN (:ids) ORDER BY k.round_no`, { replacements: { ids }, type: QT.SELECT }),
  ]);
  const { Employee, Customer } = require("../models");
  const clientes = new Map((await Customer.findAll({
    where: { id: { [Op.in]: [...new Set(ventas.map(v => v.customer_id).filter(Boolean))] } },
    attributes: ["id", "name"],
  })).map(c => [c.id, c.name]));
  const nombres = new Map((await Employee.findAll({
    where: { id: { [Op.in]: [...new Set(ventas.flatMap(v => [v.waiter_id, v.employee_id, v.held_by_employee_id]).filter(Boolean))] } },
    attributes: ["id", "full_name"],
  })).map(e => [e.id, e.full_name]));

  return {
    data: {
      table: mesa.toJSON(),
      accounts: ventas.map(v => ({
        id: v.id,
        status: v.status,
        total: v.total,
        created_at: v.created_at,
        kitchen_status: v.kitchen_status,
        bill_requested_at: v.bill_requested_at,
        customer_name: clientes.get(v.customer_id) || null,
        waiter_name: nombres.get(v.waiter_id) || nombres.get(v.employee_id) || null,
        // Una caja la tiene en su carrito: el mesonero no puede sumarle hasta que la suelte.
        held_by_name: v.held_by_employee_id && v.held_by_employee_id !== req.employee?.id ? nombres.get(v.held_by_employee_id) || "otra caja" : null,
        items: lineas.filter(l => l.sale_id === v.id),
        rounds: rondas.filter(r => r.sale_id === v.id),
      })),
    },
  };
}

/**
 * Manda una ronda desde la mesa. Si la mesa no tiene cuenta, la abre (en 'espera', a nombre del
 * mesonero en waiter_id); si la tiene, le suma las líneas. En los dos casos el inventario se
 * mueve con el mismo camino de siempre (createSale / updateSale) y la ronda sale a cocina como
 * una comanda con solo lo nuevo.
 *
 * El mesonero no cobra: aquí no se toca el estado de la cuenta, ni pagos, ni la caja.
 *
 * body: { items: [{ product_id, qty, note }], sale_id?: number | "new", note? }
 */
async function sendRound(req, tableId, body = {}) {
  const createSale = require("./sales/createSale");
  const updateSale = require("./sales/updateSale");
  const { crearComanda } = require("./kitchen");
  const { timeoutMinutes, isExpired } = require("./sales/holdLock");
  const { Product, Serie, UserSerie } = require("../models");

  const mesa = await assertTable(tableId);
  const wid = mesa.area.warehouse_id;
  await assertWarehouseAccess(req, wid);

  const lineas = Array.isArray(body.items) ? body.items : [];
  if (!lineas.length) throw fail("La ronda está vacía");
  if (lineas.length > 60) throw fail("Una ronda admite hasta 60 líneas");

  const ids = [...new Set(lineas.map(l => int(l.product_id)).filter(Number.isInteger))];
  const productos = await Product.findAll({ where: { id: { [Op.in]: ids }, sellable: true, is_variant_parent: false } });
  const porId = new Map(productos.map(p => [p.id, p]));
  const limpias = lineas.map(l => {
    const p = porId.get(int(l.product_id));
    if (!p) throw fail("Uno de los productos ya no está a la venta");
    const qty = parseFloat(l.qty);
    if (!(qty > 0) || qty > 999) throw fail(`Cantidad no válida para "${p.name}"`);
    if (!UNIDADES_FRACCIONABLES.includes(String(p.unit || "").toUpperCase()) && !Number.isInteger(qty)) {
      throw fail(`"${p.name}" se pide por unidades enteras`);
    }
    const note = String(l.note || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200) || null;
    return { product_id: p.id, name: p.name, qty, note, options: l.options };
  });

  // Adicionales: lo que no cuesta va como texto en la línea del plato y en la comanda; lo que
  // cuesta, como líneas aparte (una por cada plato), que se cobran como cualquier producto.
  const { resolver } = require("./addons");
  for (const l of limpias) {
    const r = await resolver(l.product_id, l.options, { warehouseId: wid, nombrePlato: l.name });
    l.cocina = r.cocina;
    l.extras = r.extras;
    l.notaLinea = [r.texto, l.note].filter(Boolean).join(" · ").slice(0, 200) || null;
  }
  // Líneas de la venta: el plato y, detrás, sus extras.
  const lineasVenta = limpias.flatMap(l => [
    { product_id: l.product_id, qty: l.qty, note: l.notaLinea },
    ...l.extras.map(e => ({ product_id: e.product_id, qty: l.qty, note: null })),
  ]);

  // ¿A qué cuenta va? La que se eligió, la única de la mesa, o una nueva.
  const abiertas = await cuentasDeMesa(mesa.id);
  let venta = null;
  if (body.sale_id && body.sale_id !== "new") {
    venta = abiertas.find(v => v.id === int(body.sale_id));
    if (!venta) throw fail("Esa cuenta ya no está abierta en la mesa. Recarga la mesa.", 409);
  } else if (body.sale_id !== "new") {
    if (abiertas.length > 1) throw fail("La mesa tiene varias cuentas: elige a cuál va la ronda", 409);
    venta = abiertas[0] || null;
  }

  if (venta) {
    // La caja la está cobrando o la tiene en su carrito: lo que se le sume ahora lo pisaría la
    // caja al pausar o al cobrar.
    if (venta.status === "borrador") throw fail("La caja está cobrando esta cuenta", 409);
    if (venta.held_by_employee_id && venta.held_by_employee_id !== req.employee?.id && !isExpired(venta, await timeoutMinutes())) {
      throw fail("La caja tiene abierta esta cuenta. Pídele que la pause y vuelve a enviar.", 409);
    }
    await updateSale(venta.id, { append: lineasVenta }, req);
    if (!venta.waiter_id && req.employee?.id) await Sale.update({ waiter_id: req.employee.id }, { where: { id: venta.id } });
  } else {
    // Cuenta nueva. El mesonero no elige serie: se toma la suya en esta sucursal, o la primera
    // activa de la sucursal. La caja factura con la que tenga al cobrar.
    const propias = req.employee?.id ? await UserSerie.findAll({ where: { user_id: req.employee.id }, attributes: ["serie_id"] }) : [];
    const serie = await Serie.findOne({
      where: { warehouse_id: wid, active: true, ...(propias.length ? { id: { [Op.in]: propias.map(s => s.serie_id) } } : {}) },
      order: [["id", "ASC"]],
    }) || await Serie.findOne({ where: { warehouse_id: wid, active: true }, order: [["id", "ASC"]] });
    if (!serie) throw fail("La sucursal no tiene una serie activa para abrir cuentas");

    const creada = await createSale({
      items: lineasVenta.map(l => ({ product_id: l.product_id, quantity: l.qty, note: l.note })),
      paid: 0,
      employee_id: req.employee?.id || null,
      serie_id: serie.id,
      warehouse_id: wid,
      hold: true,
      table_id: mesa.id,
    }, req, { waiterId: req.employee?.id || null });
    venta = await Sale.findByPk(creada?.data?.id ?? creada?.id);
    if (!venta) throw fail("No se pudo abrir la cuenta", 500);
  }

  const ticket = await sequelize.transaction(t => crearComanda({
    sale: venta,
    items: limpias.map(l => ({ product_id: l.product_id, name: l.name, quantity: l.qty, note: l.note, modifiers: l.cocina })),
    label: mesa.name,
    note: body.note,
    waiterId: req.employee?.id || null,
    tableId: mesa.id,
    warehouseId: wid,
  }, t));

  return { data: { sale_id: venta.id, ticket_id: ticket.id, round_no: ticket.round_no } };
}

/**
 * Ficha de un plato para el mesonero: lo que el cliente pregunta en la mesa ("¿qué trae?").
 * La descripción larga no viaja con el menú —serían cientos de textos en cada carga—, se pide
 * al abrir la ficha. Precio de la sucursal y, si es combo, lo que incluye.
 */
async function dish(req, productId, { warehouse_id } = {}) {
  const { Product, ProductStock, ProductComboItem } = require("../models");
  const wid = parseInt(warehouse_id, 10);
  if (!wid) throw fail("Elige la sucursal");
  await assertWarehouseAccess(req, wid);

  const p = await Product.findOne({
    where: { id: int(productId), sellable: true },
    attributes: ["id", "name", "short_description", "description", "price", "image_filename", "unit", "is_combo"],
  });
  if (!p) throw fail("Ese plato ya no está a la venta", 404);

  const ficha = await ProductStock.findOne({ where: { warehouse_id: wid, product_id: p.id }, attributes: ["price"] });
  const incluye = p.is_combo
    ? (await ProductComboItem.findAll({
        where: { combo_id: p.id },
        include: [{ model: Product, as: "ingredient", attributes: ["name", "unit"] }],
        order: [["id", "ASC"]],
      })).map(ci => ({ name: ci.ingredient?.name, quantity: parseFloat(ci.quantity), unit: ci.ingredient?.unit }))
    : [];

  return {
    data: {
      id: p.id,
      name: p.name,
      short_description: p.short_description || null,
      // Párrafos separados por línea en blanco, como en el catálogo público.
      description: String(p.description || "").split(/\n\s*\n/).map(s => s.trim()).filter(Boolean),
      price: parseFloat(ficha?.price ?? p.price),
      image_url: p.image_filename ? (p.image_filename.startsWith("http") ? p.image_filename : `/uploads/${p.image_filename}`) : null,
      incluye,
      // Adicionales del plato (término, extras…), con el precio de esta sucursal.
      groups: await require("./addons").forProduct(p.id, wid),
    },
  };
}

module.exports = { listAreas, saveArea, deleteArea, saveLayout, assertTable, occupancy, accounts, sendRound, dish, COLS, ROWS };
