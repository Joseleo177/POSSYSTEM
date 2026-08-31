const {
  Warehouse, Product, ProductStock, StockTransfer, StockTransferItem, Employee, Sequelize, sequelize
} = require("../../models");
const { isAdmin, employeeWarehouseIds, assertWarehouseAccess } = require("../../middleware/auth");
const { toLocalDate, endOfLocalDay } = require("../../utils/localDate");
const { Op } = Sequelize;

// La transferencia es un documento de dos tiempos:
//
//   despachar → el stock SALE del origen y queda en tránsito (no está en ningún almacén)
//   recibir   → el destino cuenta lo que llegó y solo eso ENTRA
//
// Lo que se despachó y no llegó no se pierde de vista: la transferencia queda con
// `difference_status = 'pending'` hasta que alguien decida si fue merma o si vuelve al
// origen. Nada desaparece en silencio.

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status, isOperational: true });

const num = (v) => parseFloat(parseFloat(v || 0).toFixed(4));

const TRANSFER_INCLUDE = [
  { model: Warehouse, as: 'FromWarehouse', attributes: ['name'], required: false },
  { model: Warehouse, as: 'ToWarehouse',   attributes: ['name'], required: false },
  { model: Employee,                        attributes: ['full_name'], required: false },
  { model: Employee,  as: 'Receiver',       attributes: ['full_name'], required: false },
  { model: Employee,  as: 'Canceller',      attributes: ['full_name'], required: false },
  { model: StockTransferItem, as: 'items',  required: false },
];

function serialize(row) {
  const t = row.toJSON();
  t.from_warehouse_name = t.FromWarehouse?.name ?? null;
  t.to_warehouse_name   = t.ToWarehouse?.name   ?? null;
  t.employee_name       = t.Employee?.full_name  ?? null;
  t.received_by_name    = t.Receiver?.full_name  ?? null;
  t.cancelled_by_name   = t.Canceller?.full_name ?? null;
  delete t.FromWarehouse; delete t.ToWarehouse;
  delete t.Employee; delete t.Receiver; delete t.Canceller;

  // Histórico anterior a la migración 20260821200000: la cabecera guardaba el producto.
  const items = (t.items || []).sort((a, b) => a.id - b.id);
  t.items = items;
  t.item_count   = items.length;
  t.total_sent   = num(items.reduce((s, i) => s + num(i.qty_sent), 0));
  t.total_received = items.some(i => i.qty_received != null)
    ? num(items.reduce((s, i) => s + num(i.qty_received), 0))
    : null;
  // Lo despachado que todavía no entró en ningún almacén.
  t.in_transit_qty = t.status === 'sent'
    ? t.total_sent
    : (t.difference_status === 'pending'
        ? num(items.reduce((s, i) => s + Math.max(0, num(i.qty_sent) - num(i.qty_received)), 0))
        : 0);
  return t;
}

// Correlativo por empresa. No es un documento fiscal, pero necesita un identificador estable
// para que la nota de despacho y la recepción hablen del mismo papel.
async function nextCode(companyId, transaction) {
  const row = await StockTransfer.findOne({
    where: { company_id: companyId ?? null, code: { [Op.like]: 'TR-%' } },
    order: [['code', 'DESC']],
    attributes: ['code'],
    transaction,
  });
  const last = parseInt((row?.code || '').replace('TR-', ''), 10);
  return `TR-${String((isNaN(last) ? 0 : last) + 1).padStart(6, '0')}`;
}

// Recalcula el stock global del producto (suma de todos los almacenes). Lo que está en
// tránsito no cuenta: salió del origen y todavía no entró al destino, así que no se puede
// vender en ninguna caja.
// Cabecera bloqueada + sus líneas. Van en dos consultas a propósito: Postgres rechaza
// `FOR UPDATE` sobre el lado nullable de un OUTER JOIN, así que el include de items y el
// lock de la cabecera no pueden ir en el mismo SELECT.
async function lockTransfer(id, transaction) {
  const transfer = await StockTransfer.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!transfer) throw fail("Transferencia no encontrada", 404);
  const lines = await StockTransferItem.findAll({
    where: { transfer_id: transfer.id },
    order: [['id', 'ASC']],
    transaction,
    lock: true,
  });
  return { transfer, lines };
}

async function syncProductStock(productId, transaction) {
  const total = await ProductStock.sum('qty', { where: { product_id: productId }, transaction });
  await Product.update({ stock: total || 0 }, { where: { id: productId }, transaction });
}

// ── Despacho ────────────────────────────────────────────────────
async function createTransfer(req) {
  const { from_warehouse_id, to_warehouse_id, note } = req.body;
  // Compatibilidad: acepta un solo producto ({product_id, qty}) o varios ({items:[{product_id, qty}]})
  let items = Array.isArray(req.body.items) && req.body.items.length
    ? req.body.items
    : [{ product_id: req.body.product_id, qty: req.body.qty }];
  items = items.filter(i => i && i.product_id != null);

  if (!from_warehouse_id || !to_warehouse_id) throw fail("Origen y destino son requeridos");
  if (parseInt(from_warehouse_id) === parseInt(to_warehouse_id)) {
    throw fail("El almacén origen y destino deben ser distintos");
  }
  if (!items.length) throw fail("Debes agregar al menos un producto");

  const transaction = await sequelize.transaction();
  try {
    const now = new Date();
    const transfer = await StockTransfer.create({
      code: await nextCode(req.employee?.company_id, transaction),
      from_warehouse_id: from_warehouse_id || null,
      to_warehouse_id,
      status: 'sent',
      difference_status: 'none',
      note: note || null,
      employee_id: req.employee?.id || null,
      dispatched_at: now,
    }, { transaction });

    const created = [];
    for (const it of items) {
      const parsedQty = num(it.qty);
      if (isNaN(parsedQty) || parsedQty <= 0) throw fail("La cantidad debe ser mayor a 0");

      const product = await Product.findByPk(it.product_id, { transaction, lock: true });
      if (!product) throw fail("Producto no encontrado", 404);
      if (product.is_service) throw fail(`"${product.name}" es un servicio: no maneja stock`);
      if (product.is_combo)   throw fail(`"${product.name}" es un combo: su stock sale de los ingredientes`);

      const fromStock = await ProductStock.findOne({
        where: { warehouse_id: from_warehouse_id, product_id: it.product_id },
        transaction,
        lock: true
      });
      const available = num(fromStock?.qty);
      if (available < parsedQty) {
        throw fail(`Stock insuficiente de "${product.name}" en el origen. Disponible: ${available}`);
      }

      // Sale del origen y queda en tránsito. El destino NO se toca hasta la recepción.
      await fromStock.decrement('qty', { by: parsedQty, transaction });
      await syncProductStock(it.product_id, transaction);

      created.push(await StockTransferItem.create({
        transfer_id:  transfer.id,
        product_id:   it.product_id,
        product_name: product.name,
        unit:         product.unit || null,
        qty_sent:     parsedQty,
        // Lo que costaba en el origen. Si esa sucursal nunca recibió una compra propia, el
        // del catálogo es la única referencia que hay.
        unit_cost:    fromStock.cost_price ?? product.cost_price ?? null,
      }, { transaction }));
    }

    await transaction.commit();
    const full = await StockTransfer.findByPk(transfer.id, { include: TRANSFER_INCLUDE });
    return { data: serialize(full), count: created.length };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ── Recepción ───────────────────────────────────────────────────
// `items`: [{ id, qty_received, diff_reason }]. Lo que no venga se toma como recibido
// completo — el receptor confirma cantidad por línea en la pantalla.
async function receiveTransfer(id, req) {
  const { items = [], note } = req.body || {};

  const transaction = await sequelize.transaction();
  try {
    const { transfer, lines } = await lockTransfer(id, transaction);
    if (transfer.status === 'cancelled') throw fail("Esta transferencia fue anulada");
    if (transfer.status !== 'sent')      throw fail("Esta transferencia ya fue recibida");

    // Recibe el destino, no quien despachó: es el control cruzado que da sentido al documento.
    await assertWarehouseAccess(req, transfer.to_warehouse_id);
    if (!isAdmin(req) && transfer.employee_id && transfer.employee_id === req.employee?.id) {
      throw fail("No puedes recibir una transferencia que despachaste tú mismo", 403);
    }

    const byId = new Map(items.map(i => [parseInt(i.id), i]));
    let anyDifference = false;

    for (const line of lines) {
      const sent     = num(line.qty_sent);
      const input    = byId.get(line.id);
      const received = input && input.qty_received != null ? num(input.qty_received) : sent;

      if (isNaN(received) || received < 0) throw fail(`Cantidad recibida inválida en "${line.product_name}"`);
      if (received > sent) {
        throw fail(`No puedes recibir más de lo despachado en "${line.product_name}" (despachado: ${sent})`);
      }

      if (received > 0) {
        const [toStock] = await ProductStock.findOrCreate({
          where: { warehouse_id: transfer.to_warehouse_id, product_id: line.product_id },
          defaults: { qty: 0 },
          transaction,
          lock: true,
        });
        await toStock.increment('qty', { by: received, transaction });

        // El costo viaja con la mercancía: llega valorizada a lo que costó donde estaba. Sin
        // esto, un producto que la sucursal destino nunca compró se quedaba con el costo del
        // catálogo —que puede ser de otra tienda y de otro mes— y el margen de esa venta
        // salía inventado. `line.unit_cost` se congeló al despachar, así que un cambio de
        // costo en el origen mientras la carga iba en camino no altera lo que llega.
        if (line.unit_cost != null) {
          await toStock.update({ cost_price: line.unit_cost }, { transaction });
        }

        await syncProductStock(line.product_id, transaction);
      }

      if (received < sent) anyDifference = true;

      await line.update({
        qty_received: received,
        diff_reason: received < sent ? (input?.diff_reason || null) : null,
      }, { transaction });
    }

    await transfer.update({
      status: anyDifference ? 'received_with_differences' : 'received',
      difference_status: anyDifference ? 'pending' : 'none',
      received_by: req.employee?.id || null,
      received_at: new Date(),
      receipt_note: note || null,
    }, { transaction });

    await transaction.commit();
    const full = await StockTransfer.findByPk(transfer.id, { include: TRANSFER_INCLUDE });
    return { data: serialize(full) };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ── Resolución de faltantes ─────────────────────────────────────
// El faltante quedó en tránsito: o se da por perdido (merma) o vuelve al origen.
// `items`: [{ id, resolution: 'loss' | 'return', note }]
async function resolveDifferences(id, req) {
  const { items = [] } = req.body || {};
  if (!items.length) throw fail("Indica qué hacer con cada faltante");

  const transaction = await sequelize.transaction();
  try {
    const { transfer, lines } = await lockTransfer(id, transaction);
    if (transfer.difference_status !== 'pending') throw fail("Esta transferencia no tiene faltantes por resolver");

    // Resolver un faltante mueve stock del origen: lo decide quien responde por ese almacén.
    await assertWarehouseAccess(req, transfer.from_warehouse_id, { optional: true });

    const byId = new Map(items.map(i => [parseInt(i.id), i]));
    for (const line of lines) {
      const missing = num(line.qty_sent) - num(line.qty_received);
      if (missing <= 0 || line.resolved_at) continue;

      const input = byId.get(line.id);
      if (!input) throw fail(`Falta resolver el faltante de "${line.product_name}"`);
      if (!['loss', 'return'].includes(input.resolution)) {
        throw fail(`Resolución inválida para "${line.product_name}"`);
      }

      // 'return': la mercancía nunca salió o apareció, y vuelve a contar en el origen.
      // 'loss': se perdió en el camino; ya está descontada del origen, solo se deja constancia.
      if (input.resolution === 'return' && transfer.from_warehouse_id) {
        const [fromStock] = await ProductStock.findOrCreate({
          where: { warehouse_id: transfer.from_warehouse_id, product_id: line.product_id },
          defaults: { qty: 0 },
          transaction,
          lock: true,
        });
        await fromStock.increment('qty', { by: missing, transaction });
        await syncProductStock(line.product_id, transaction);
      }

      await line.update({
        diff_resolution: input.resolution,
        diff_reason: input.note || line.diff_reason,
        resolved_at: new Date(),
      }, { transaction });
    }

    await transfer.update({ difference_status: 'resolved' }, { transaction });

    await transaction.commit();
    const full = await StockTransfer.findByPk(transfer.id, { include: TRANSFER_INCLUDE });
    return { data: serialize(full) };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ── Anulación ───────────────────────────────────────────────────
// Solo mientras está en tránsito: devuelve todo al origen. Una transferencia recibida no se
// anula —se corrige con una transferencia de vuelta— y nunca se borra.
async function cancelTransfer(id, req) {
  const { reason } = req.body || {};

  const transaction = await sequelize.transaction();
  try {
    const { transfer, lines } = await lockTransfer(id, transaction);
    if (transfer.status !== 'sent') {
      throw fail("Solo se puede anular una transferencia que sigue en tránsito");
    }

    await assertWarehouseAccess(req, transfer.from_warehouse_id, { optional: true });

    for (const line of lines) {
      if (!transfer.from_warehouse_id) continue;
      const [fromStock] = await ProductStock.findOrCreate({
        where: { warehouse_id: transfer.from_warehouse_id, product_id: line.product_id },
        defaults: { qty: 0 },
        transaction,
        lock: true,
      });
      await fromStock.increment('qty', { by: num(line.qty_sent), transaction });
      await syncProductStock(line.product_id, transaction);
    }

    await transfer.update({
      status: 'cancelled',
      cancelled_by: req.employee?.id || null,
      cancelled_at: new Date(),
      cancel_reason: reason || null,
    }, { transaction });

    await transaction.commit();
    const full = await StockTransfer.findByPk(transfer.id, { include: TRANSFER_INCLUDE });
    return { data: serialize(full) };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ── Consultas ───────────────────────────────────────────────────
// Cada empleado ve solo las transferencias que tocan sus almacenes; el admin las ve todas.
//
// `direction` se lee siempre respecto al almacén de referencia —el elegido en el filtro, o
// los del empleado si no eligió ninguno—: 'in' es lo que llega, 'out' lo que sale. Para el
// admin sin almacén elegido no hay referencia posible, así que se ignora.
async function visibilityWhere(req, warehouse_id, direction) {
  const where = {};
  let visibleIds = null;
  if (!isAdmin(req)) {
    visibleIds = await employeeWarehouseIds(req.employee?.id);
    if (visibleIds.length === 0) return null;
    if (warehouse_id && !visibleIds.includes(parseInt(warehouse_id))) {
      throw fail("No tienes acceso a este almacén", 403);
    }
  }

  const ref = warehouse_id
    ? parseInt(warehouse_id)
    : (visibleIds ? { [Op.in]: visibleIds } : null);
  if (ref === null) return where;

  if (direction === 'in')       where.to_warehouse_id   = ref;
  else if (direction === 'out') where.from_warehouse_id = ref;
  else where[Op.or] = [{ from_warehouse_id: ref }, { to_warehouse_id: ref }];

  return where;
}

// Rango de fechas sobre la fecha del documento. El día "hasta" entra completo: quien filtra
// hasta el 21 espera ver lo despachado esa misma tarde.
function dateRange(date_from, date_to) {
  const range = {};
  if (date_from) range[Op.gte] = toLocalDate(date_from);
  if (date_to)   range[Op.lte] = endOfLocalDay(date_to);
  return Object.getOwnPropertySymbols(range).length ? range : null;
}

// Filtrar por lo que hay en las líneas sin tocar el include: un include `required` junto al
// `limit` obliga a Sequelize a mover la condición a la subconsulta y el recuento deja de
// cuadrar. Con `id IN (subconsulta)` la cabecera se filtra sola y las líneas siguen viniendo
// completas, que es lo que la pantalla necesita mostrar.
function inItems(condition) {
  return { [Op.in]: Sequelize.literal(`(SELECT transfer_id FROM stock_transfer_items WHERE ${condition})`) };
}

async function getTransfers(req) {
  const {
    warehouse_id, product_id, status, search, direction, date_from, date_to,
    limit = 50, offset = 0,
  } = req.query;

  const where = await visibilityWhere(req, warehouse_id, direction);
  if (!where) return { data: [], total: 0 };

  const and = [];

  if (status) {
    // 'pending' agrupa lo que exige acción: en tránsito o con faltantes sin resolver.
    if (status === 'pending') {
      and.push({ [Op.or]: [{ status: 'sent' }, { difference_status: 'pending' }] });
    } else {
      where.status = { [Op.in]: String(status).split(',') };
    }
  }

  const range = dateRange(date_from, date_to);
  if (range) where.created_at = range;

  if (product_id) where.id = inItems(`product_id = ${parseInt(product_id)}`);

  // Se busca por número de documento o por producto: son las dos formas en que alguien
  // recuerda una transferencia —el papel que tiene en la mano, o qué venía dentro—.
  const term = String(search || '').trim();
  if (term) {
    const like = sequelize.escape(`%${term}%`);
    and.push({
      [Op.or]: [
        { code: { [Op.iLike]: `%${term}%` } },
        { id: inItems(`product_name ILIKE ${like}`) },
      ],
    });
  }

  if (and.length) where[Op.and] = and;

  const { count, rows } = await StockTransfer.findAndCountAll({
    where,
    include: TRANSFER_INCLUDE,
    order: [['created_at', 'DESC']],
    limit:  parseInt(limit),
    offset: parseInt(offset),
    distinct: true,
  });

  return { data: rows.map(serialize), total: count };
}

async function getTransfer(id, req) {
  const transfer = await StockTransfer.findByPk(id, { include: TRANSFER_INCLUDE });
  if (!transfer) throw fail("Transferencia no encontrada", 404);

  if (!isAdmin(req)) {
    const visibleIds = await employeeWarehouseIds(req.employee?.id);
    const touches = [transfer.from_warehouse_id, transfer.to_warehouse_id]
      .some(w => w && visibleIds.includes(w));
    if (!touches) throw fail("No tienes acceso a esta transferencia", 403);
  }

  return { data: serialize(transfer) };
}

// Contadores para las pestañas: cuántas esperan recepción, cuántas tienen faltantes abiertos.
async function getTransferSummary(req) {
  const warehouse_id = req.query?.warehouse_id;
  const where = await visibilityWhere(req, warehouse_id);
  if (!where) return { data: { in_transit: 0, to_receive: 0, with_differences: 0 } };

  const visibleIds = isAdmin(req) ? null : await employeeWarehouseIds(req.employee?.id);

  const [inTransit, withDiff] = await Promise.all([
    StockTransfer.count({ where: { ...where, status: 'sent' } }),
    StockTransfer.count({ where: { ...where, difference_status: 'pending' } }),
  ]);

  // "Por recibir" es lo que le toca al usuario en ESTE almacén: en tránsito hacia el almacén
  // filtrado, o hacia cualquiera de los suyos si no filtró.
  const destino = warehouse_id
    ? parseInt(warehouse_id)
    : (visibleIds ? { [Op.in]: visibleIds } : null);
  const toReceive = await StockTransfer.count({
    where: destino === null ? { status: 'sent' } : { status: 'sent', to_warehouse_id: destino },
  });

  return { data: { in_transit: inTransit, to_receive: toReceive, with_differences: withDiff } };
}

module.exports = {
  createTransfer, getTransfers, getTransfer, getTransferSummary,
  receiveTransfer, resolveDifferences, cancelTransfer,
};
