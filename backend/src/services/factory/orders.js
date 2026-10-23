'use strict';

const {
  sequelize, Sequelize, Op, Product, Customer, Sale, SaleItem, Serie, Warehouse, Employee,
  MaterialPiece, FabricationOrder, FabricationOrderPiece, FabricationOrderItem, FabricationOrderPlan,
  FabricationStage, FabricationOrderStage, FabricationOrderCut,
  fail, r3, r4, r5, TOL, MAX_QTY, MAX_MONEY, sizeOf, cutsLeft, hasShape, mm, money, text,
  companyOf, employeeOf, orderCode, ownWarehouse,
  moveStock, unitCostOf, lockNumbering, inTransaction, assertWarehouseAccess, visibleWarehouseIds,
} = require("./shared");
const assignInvoiceNumber = require("../sales/assignInvoiceNumber");
const { isIntegerUnit } = require("../../utils/units");
const { readRecipe, computeRecipe, estimate } = require("./recipes");

const QT = Sequelize.QueryTypes;
const TYPES = ["estandar", "medida"];
const DESTINATIONS = ["stock", "cliente"];
const STATUS_FILTERS = ["abierta", "terminada", "anulada", "por_facturar", "todas"];

// Material + accesorios + mano de obra (minutos por etapa × su costo por hora).
const totalCost = (o) => r4(parseFloat(o.material_cost || 0) + parseFloat(o.accessories_cost || 0) + parseFloat(o.labor_cost || 0));
const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dueDate = (v) => {
  if (v == null || v === "") return null;
  if (!ISO_DAY.test(String(v))) throw fail("Fecha comprometida no válida");
  return String(v);
};
const unitCost = (o) => {
  const q = parseFloat(o.quantity || 0);
  return q > 0 ? r4(totalCost(o) / q) : 0;
};

// Orden bloqueada dentro de la transacción, con el acceso al almacén comprobado.
async function lockedOrder(req, id, transaction) {
  const company = companyOf(req);
  const order = await FabricationOrder.findOne({ where: { id: parseInt(id) || 0, company_id: company }, transaction, lock: true });
  if (!order) throw fail("Orden no encontrada", 404);
  await assertWarehouseAccess(req, order.warehouse_id);
  return order;
}

const mustBeOpen = (order) => {
  if (order.status !== "abierta") {
    throw fail(order.status === "anulada" ? "La orden está anulada" : "La orden ya está terminada: reábrela para cambiarla");
  }
};

// La factura que cuenta: una anulada libera la orden para volver a facturarla.
async function activeSale(order, transaction) {
  if (!order.sale_id) return null;
  const sale = await Sale.findByPk(order.sale_id, { transaction });
  return sale && sale.status !== "anulado" ? sale : null;
}

// Si la orden ya se facturó, la línea de la factura lleva el costo de hoy. Se mantiene al día
// para que el reporte de márgenes vea lo que de verdad costó, aunque se haya facturado antes
// de terminar.
async function syncSaleCost(order, transaction) {
  if (!order.sale_id) return;
  await SaleItem.update({ cost_price: unitCost(order) }, { where: { sale_id: order.sale_id }, transaction });
}

// ── Lectura ─────────────────────────────────────────────────────────────────────────────

async function listOrders(req, q = {}) {
  const company = companyOf(req);
  const visibles = await visibleWarehouseIds(req);
  const where = ["o.company_id = :company"];
  const rep = { company };

  if (visibles !== null) { where.push("o.warehouse_id IN (:visibles)"); rep.visibles = visibles.length ? visibles : [0]; }
  if (q.warehouse_id) { where.push("o.warehouse_id = :wid"); rep.wid = await ownWarehouse(req, q.warehouse_id); }

  const status = STATUS_FILTERS.includes(q.status) ? q.status : "abierta";
  if (status === "por_facturar") {
    where.push("o.destination = 'cliente' AND o.status <> 'anulada' AND (o.sale_id IS NULL OR s.status = 'anulado')");
  } else if (status !== "todas") { where.push("o.status = :status"); rep.status = status; }

  if (q.search && String(q.search).trim()) {
    const s = String(q.search).trim().slice(0, 100);
    const n = /^(OF-?)?\d+$/i.test(s) ? parseInt(s.replace(/^OF-?/i, ""), 10) : NaN;
    where.push(`(o.description ILIKE :like OR c.name ILIKE :like OR p.name ILIKE :like${isFinite(n) ? " OR o.number = :n" : ""})`);
    rep.like = `%${s.replace(/[%_\\]/g, "\\$&")}%`;
    if (isFinite(n)) rep.n = n;
  }

  const limit = Math.min(Math.max(parseInt(q.limit) || 50, 1), 200);
  const page = Math.min(Math.max(parseInt(q.page) || 1, 1), 100000);
  rep.limit = limit; rep.offset = (page - 1) * limit;

  const base = `
      FROM fabrication_orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN products p  ON p.id = o.product_id
      JOIN warehouses w     ON w.id = o.warehouse_id
      LEFT JOIN sales s     ON s.id = o.sale_id
      LEFT JOIN fabrication_stages st ON st.id = o.current_stage_id
     WHERE ${where.join(" AND ")}`;

  const [rows, [{ total }]] = await Promise.all([
    sequelize.query(`
      SELECT o.id, o.number, o.type, o.destination, o.description, o.quantity::float AS quantity,
             o.status, o.material_cost::float AS material_cost, o.accessories_cost::float AS accessories_cost,
             o.labor_cost::float AS labor_cost, o.current_stage_id, st.name AS stage_name,
             to_char(o.due_date, 'YYYY-MM-DD') AS due_date, o.assignee,
             o.sale_price::float AS sale_price, o.sale_id, o.created_at, o.finished_at,
             o.customer_id, c.name AS customer_name, o.product_id, p.name AS product_name, p.unit AS product_unit,
             o.warehouse_id, w.name AS warehouse_name, s.invoice_number, s.status AS sale_status,
             (SELECT COUNT(*) FROM fabrication_order_pieces op WHERE op.order_id = o.id AND op.returned_at IS NULL)::int AS pieces_in_shop,
             (SELECT COUNT(*) FROM fabrication_order_pieces op WHERE op.order_id = o.id)::int AS pieces_used
      ${base}
      ORDER BY o.number DESC
      LIMIT :limit OFFSET :offset`, { replacements: rep, type: QT.SELECT }),
    sequelize.query(`SELECT COUNT(*)::int AS total ${base}`, { replacements: rep, type: QT.SELECT }),
  ]);

  return { data: rows.map(r => ({ ...r, code: orderCode(r.number), total_cost: totalCost(r) })), total, page, limit };
}

async function getOrder(req, id) {
  const company = companyOf(req);
  const order = await FabricationOrder.findOne({
    where: { id: parseInt(id) || 0, company_id: company },
    include: [
      { model: Customer,  attributes: ["id", "name", "rif"], required: false },
      { model: Product,   attributes: ["id", "name", "unit"], required: false },
      { model: Warehouse, attributes: ["id", "name"], required: false },
      { model: Employee,  attributes: ["full_name"], required: false },
      { model: Sale,      attributes: ["id", "invoice_number", "status", "total"], required: false },
      { model: FabricationOrderItem, as: "items", required: false },
    ],
    order: [[{ model: FabricationOrderItem, as: "items" }, "id", "ASC"]],
  });
  if (!order) throw fail("Orden no encontrada", 404);
  await assertWarehouseAccess(req, order.warehouse_id);

  // Cada pieza entregada, con lo que volvió de ella en esta orden.
  const uses = await sequelize.query(`
    SELECT op.id, op.piece_id, op.delivered_at, op.returned_at, op.consumed::float AS consumed, op.layout,
           COALESCE((SELECT json_agg(json_build_object('plan_id', c.plan_id, 'cuts', c.cuts) ORDER BY c.id)
                       FROM fabrication_order_cuts c WHERE c.use_id = op.id), '[]'::json) AS cuts,
           op.cost::float AS cost, op.note,
           mp.code, mp.product_id, mp.width_mm, mp.length_mm, mp.is_irregular, mp.shape, mp.size::float AS size,
           mp.unit_cost::float AS unit_cost, p.name AS product_name, p.piece_mode, p.unit,
           COALESCE((
             SELECT json_agg(json_build_object(
                      'id', ch.id, 'code', ch.code, 'width_mm', ch.width_mm, 'length_mm', ch.length_mm,
                      'is_irregular', ch.is_irregular, 'shape', ch.shape, 'size', ch.size::float, 'status', ch.status)
                    ORDER BY ch.id)
               FROM material_pieces ch
              WHERE ch.parent_id = op.piece_id AND ch.source_order_id = op.order_id AND ch.status <> 'anulada'
           ), '[]'::json) AS remnants
      FROM fabrication_order_pieces op
      JOIN material_pieces mp ON mp.id = op.piece_id
      JOIN products p ON p.id = mp.product_id
     WHERE op.order_id = :id
     ORDER BY op.id`, { replacements: { id: order.id }, type: QT.SELECT });

  const stages = await sequelize.query(`
    SELECT os.id, os.stage_id, os.stage_name, os.started_at, os.finished_at, os.minutes::float AS minutes,
           os.cost_per_hour::float AS cost_per_hour, os.cost::float AS cost, os.worker, os.note
      FROM fabrication_order_stages os
     WHERE os.order_id = :id
     ORDER BY os.started_at, os.id`, { replacements: { id: order.id }, type: QT.SELECT });

  const d = order.toJSON();
  const saleActive = d.Sale && d.Sale.status !== "anulado";
  const plan = await planOf(order, uses, d.items || [], stages);
  const current = d.current_stage_id ? await FabricationStage.findByPk(d.current_stage_id, { attributes: ["id", "name"] }) : null;
  return {
    data: {
      ...d,
      code: orderCode(d.number),
      quantity: parseFloat(d.quantity),
      material_cost: parseFloat(d.material_cost),
      accessories_cost: parseFloat(d.accessories_cost),
      labor_cost: parseFloat(d.labor_cost || 0),
      current_stage: current ? { id: current.id, name: current.name } : null,
      stages,
      sale_price: d.sale_price != null ? parseFloat(d.sale_price) : null,
      total_cost: totalCost(d),
      unit_cost: unitCost(d),
      invoiced: !!saleActive,
      employee_name: d.Employee?.full_name ?? null,
      items: (d.items || []).map(i => ({ ...i, quantity: parseFloat(i.quantity), unit_cost: parseFloat(i.unit_cost) })),
      uses,
      plan,
    },
  };
}

// ── Receta de la orden ──────────────────────────────────────────────────────────────────

async function planLines(orderId, transaction) {
  return sequelize.query(`
    SELECT pl.id, pl.kind, pl.component_id, pl.stage_id, pl.name, pl.cut_width_mm, pl.cut_length_mm,
           pl.cuts, pl.quantity::float AS quantity, pl.minutes::float AS minutes, pl.position,
           p.unit, p.piece_mode
      FROM fabrication_order_plan pl
      LEFT JOIN products p ON p.id = pl.component_id
     WHERE pl.order_id = :id
     ORDER BY pl.position, pl.id`, { replacements: { id: orderId }, type: QT.SELECT, transaction });
}

// Minutos que la receta asigna a cada etapa para toda la orden.
async function plannedMinutes(order, transaction) {
  const lines = (await planLines(order.id, transaction)).filter(l => l.kind === "proceso");
  const out = new Map();
  for (const l of lines) out.set(l.stage_id, r2((out.get(l.stage_id) || 0) + l.minutes * parseFloat(order.quantity)));
  return out;
}

/**
 * Lo que la receta dice para esta orden contra lo que de verdad pasó. Por componente:
 * material esperado (cortes × tamaño × cantidad) contra lo consumido en las devoluciones, y
 * accesorios esperados contra los anotados. La diferencia del material es la merma.
 */
async function planOf(order, uses, items, stages = []) {
  const lines = await planLines(order.id);
  if (!lines.length) return null;
  const est = await estimate(lines, order.quantity, order.warehouse_id);

  // Por componente (material o accesorio) y por etapa (proceso, en minutos).
  const keyOf = (l) => (l.kind === "proceso" ? `e${l.stage_id}` : `p${l.component_id}`);
  const byComponent = new Map();
  for (const l of est.lines) {
    const k = keyOf(l);
    const c = byComponent.get(k) || {
      key: k, component_id: l.component_id, stage_id: l.stage_id, name: l.name, kind: l.kind,
      unit: l.kind === "proceso" ? "MIN" : l.unit, expected: 0, actual: 0,
    };
    c.expected = l.kind === "proceso" ? r2(c.expected + l.expected) : r3(c.expected + l.expected);
    byComponent.set(k, c);
  }
  for (const u of uses) {
    const c = byComponent.get(`p${u.product_id}`);
    if (c && u.returned_at) c.actual = r3(c.actual + (u.consumed || 0));
  }
  for (const it of items) {
    const c = byComponent.get(`p${it.product_id}`);
    if (c && c.kind === "accesorio") c.actual = r3(c.actual + parseFloat(it.quantity));
  }
  for (const st of stages) {
    const c = byComponent.get(`e${st.stage_id}`);
    if (c && st.finished_at) c.actual = r2(c.actual + (st.minutes || 0));
  }
  // Cada corte de la receta con lo que ya se le entregó: cuántos cortes cubren las piezas y
  // cuáles son (una pieza puede cubrir varios cortes distintos). Lo que falta es lo que el
  // botón Entregar todavía tiene que conseguir.
  const qtyUnits = Math.ceil(parseFloat(order.quantity));
  for (const l of est.lines) {
    if (l.kind !== "material") continue;
    const assigned = uses.flatMap(u => u.cuts.filter(c => c.plan_id === l.id)
      .map(c => ({ use_id: u.id, piece_id: u.piece_id, code: u.code, cuts: c.cuts })));
    l.cuts_needed = l.cuts * qtyUnits;
    l.cuts_covered = assigned.reduce((sum, a) => sum + a.cuts, 0);
    l.cuts_missing = Math.max(0, l.cuts_needed - l.cuts_covered);
    l.pieces = assigned;
  }

  const summary = [...byComponent.values()].map(c => ({
    ...c,
    diff: r3(c.actual - c.expected),
    diff_pct: c.expected > 0 ? Math.round(((c.actual - c.expected) / c.expected) * 1000) / 10 : null,
  }));
  return { lines: est.lines, by_component: summary, estimated_cost: est.total_cost, estimated_unit_cost: est.unit_cost };
}

// Saca un accesorio del stock y lo carga a la orden, al costo de la sucursal.
async function consumeAccessory(order, product, qty, req, transaction, note = "accesorio") {
  const cost = r4(await unitCostOf(product.id, order.warehouse_id, transaction));
  const item = await FabricationOrderItem.create({
    company_id: order.company_id,
    order_id: order.id,
    product_id: product.id,
    product_name: product.name,
    quantity: qty,
    unit_cost: cost,
    employee_id: employeeOf(req),
  }, { transaction });
  await moveStock({
    productId: product.id, warehouseId: order.warehouse_id, delta: -qty,
    req, transaction, notes: `${orderCode(order.number)} · ${note}`,
  });
  await order.update({ accessories_cost: r4(parseFloat(order.accessories_cost) + qty * cost) }, { transaction });
  return item;
}

// ── Alta y edición ──────────────────────────────────────────────────────────────────────

async function validateFinishedProduct(productId, transaction) {
  const product = await Product.findByPk(parseInt(productId) || 0, { transaction });
  if (!product) throw fail("Producto no encontrado", 404);
  if (product.piece_mode || product.is_combo || product.is_service || product.is_variant_parent) {
    throw fail(`"${product.name}" no puede ser el producto fabricado`);
  }
  return product;
}

function parseQuantity(value, product) {
  const qty = r3(value);
  if (!(qty > 0)) throw fail("La cantidad debe ser mayor que cero");
  if (qty > MAX_QTY) throw fail("La cantidad es demasiado grande");
  if (product && isIntegerUnit(product.unit) && !Number.isInteger(qty)) {
    throw fail(`"${product.name}" se cuenta por unidades: la cantidad va sin decimales`);
  }
  return qty;
}

async function findCustomer(id, transaction) {
  const c = await Customer.findByPk(parseInt(id) || 0, { transaction });
  if (!c) throw fail("Cliente no encontrado", 404);
  return c.id;
}

async function createOrder(req, body = {}) {
  const company = companyOf(req);
  const type = TYPES.includes(body.type) ? body.type : "medida";
  const destination = DESTINATIONS.includes(body.destination) ? body.destination : "cliente";

  return inTransaction(async (transaction) => {
    const warehouseId = await ownWarehouse(req, body.warehouse_id, transaction);
    let product = null;
    if (body.product_id) product = await validateFinishedProduct(body.product_id, transaction);
    if (!product && type === "estandar") throw fail("Una orden estándar lleva el producto que se fabrica");
    if (!product && destination === "stock") throw fail("Para que entre al inventario, elige el producto que se fabrica");

    const description = text(body.description || product?.name, 300);
    if (!description) throw fail("Describe qué se va a fabricar");
    const quantity = parseQuantity(body.quantity ?? 1, product);
    const customerId = body.customer_id && destination === "cliente" ? await findCustomer(body.customer_id, transaction) : null;
    const salePrice = destination === "cliente" ? money(body.sale_price, "Precio del lote") : null;

    // Receta del producto, calculada con los valores de esta orden (el mesón de 1,80 × 0,60).
    // Se calcula antes de numerar: una fórmula que no cuadra no debe gastar un número de orden.
    const recipe = product ? await readRecipe(company, product.id, transaction) : null;
    const computed = recipe
      ? await computeRecipe(recipe, { values: body.params || {}, quantity, warehouseId }, transaction)
      : null;

    await lockNumbering("ordenes", company, transaction);
    const max = await FabricationOrder.max("number", { where: { company_id: company }, transaction });

    const order = await FabricationOrder.create({
      company_id: company,
      number: (parseInt(max) || 0) + 1,
      warehouse_id: warehouseId,
      type, destination,
      product_id: product?.id ?? null,
      description, quantity,
      customer_id: customerId,
      sale_price: salePrice != null ? r5(salePrice) : null,
      notes: text(body.notes, 2000),
      due_date: dueDate(body.due_date),
      assignee: text(body.assignee, 80),
      employee_id: employeeOf(req),
    }, { transaction });

    // Con receta, la orden se lleva una copia ya calculada (por unidad), los valores usados
    // y las instrucciones.
    if (computed) {
      for (let i = 0; i < computed.lines.length; i++) {
        const l = computed.lines[i];
        await FabricationOrderPlan.create({
          company_id: company, order_id: order.id, kind: l.kind,
          component_id: l.component_id || null, stage_id: l.stage_id || null, name: String(l.name).slice(0, 200),
          cut_width_mm: l.cut_width_mm ?? null, cut_length_mm: l.cut_length_mm ?? null, cuts: l.cuts ?? null,
          quantity: l.kind === "accesorio" ? l.quantity : null,
          minutes: l.kind === "proceso" ? l.minutes : null,
          position: i,
        }, { transaction });
      }
      await order.update({
        instructions: recipe.instructions || null,
        params: computed.params.length ? computed.params : null,
      }, { transaction });
    }

    return { data: { ...order.toJSON(), code: orderCode(order.number) } };
  });
}

async function updateOrder(req, id, body = {}) {
  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    if (order.status === "anulada") throw fail("La orden está anulada");
    const changes = {};

    if (body.description !== undefined) {
      const d = text(body.description, 300);
      if (!d) throw fail("Describe qué se va a fabricar");
      changes.description = d;
    }
    if (body.notes !== undefined) changes.notes = text(body.notes, 2000);
    if (body.due_date !== undefined) changes.due_date = dueDate(body.due_date);
    if (body.assignee !== undefined) changes.assignee = text(body.assignee, 80);

    // Lo que va en la factura no cambia mientras haya una factura viva.
    if (!(await activeSale(order, transaction))) {
      if (body.customer_id !== undefined && order.destination === "cliente") {
        changes.customer_id = body.customer_id ? await findCustomer(body.customer_id, transaction) : null;
      }
      if (body.sale_price !== undefined && order.destination === "cliente") {
        const p = money(body.sale_price, "Precio del lote");
        changes.sale_price = p != null ? r5(p) : null;
      }
      if (body.quantity !== undefined) {
        // Con lo terminado ya en el inventario, cambiar la cantidad descuadraría la entrada.
        if (order.status !== "abierta") throw fail("Reabre la orden para cambiar la cantidad");
        const product = order.product_id ? await Product.findByPk(order.product_id, { transaction }) : null;
        changes.quantity = parseQuantity(body.quantity, product);
      }
    }

    await order.update(changes, { transaction });
    await syncSaleCost(order, transaction);
    return { data: order.toJSON() };
  });
}

// ── Piezas en el taller ─────────────────────────────────────────────────────────────────

const fmtCut = (w, l) => (w ? `${(w / 1000).toLocaleString("es-VE")} × ${(l / 1000).toLocaleString("es-VE")} m` : `${(l / 1000).toLocaleString("es-VE")} m`);

/**
 * Cuántos cortes de la línea `plan_id` cubre `piece`, validado: mismo material, que la pieza dé
 * al menos un corte (probando girarla) y que ese corte no esté ya cubierto. Si la pieza ya está
 * en el taller para esta orden (`use`), lo que ya cubre de otros cortes se le descuenta.
 */
async function coverCut(order, piece, use, plan_id, transaction) {
  const planLine = await FabricationOrderPlan.findOne({ where: { id: parseInt(plan_id) || 0, order_id: order.id }, transaction });
  if (!planLine || planLine.kind !== "material") throw fail("Ese corte no es de esta orden", 404);
  if (planLine.component_id !== piece.product_id) {
    throw fail(`La pieza #${piece.code} es de otro material: este corte pide ${planLine.name}`);
  }
  const product = await Product.findByPk(piece.product_id, { attributes: ["piece_mode"], transaction });
  const mode = product?.piece_mode || (planLine.cut_width_mm ? "area" : "length");
  const cutLabel = fmtCut(planLine.cut_width_mm, planLine.cut_length_mm);

  const needed = planLine.cuts * Math.ceil(parseFloat(order.quantity));
  const [{ done }] = await sequelize.query(
    `SELECT COALESCE(SUM(cuts), 0)::int AS done FROM fabrication_order_cuts WHERE plan_id = :plan`,
    { replacements: { plan: planLine.id }, type: QT.SELECT, transaction });
  const remaining = needed - done;
  if (remaining <= 0) throw fail(`Los ${needed} cortes de ${cutLabel} ya están cubiertos`);

  let taken = [];
  if (use) {
    taken = await sequelize.query(`
      SELECT c.plan_id, c.cuts, p.cut_width_mm AS w, p.cut_length_mm AS l
        FROM fabrication_order_cuts c JOIN fabrication_order_plan p ON p.id = c.plan_id
       WHERE c.use_id = :use`, { replacements: { use: use.id }, type: QT.SELECT, transaction });
    if (taken.some(t => t.plan_id === planLine.id)) throw fail(`La pieza #${piece.code} ya cubre lo que le alcanza de ${cutLabel}`);
  }
  const fits = cutsLeft(piece, mode, planLine.cut_width_mm, planLine.cut_length_mm, taken);
  if (fits < 1) {
    throw fail(taken.length
      ? `A la pieza #${piece.code} ya no le queda para un corte de ${cutLabel}: lo demás está asignado a otros cortes`
      : `La pieza #${piece.code} no alcanza para un corte de ${cutLabel}`);
  }
  const covered = Math.min(fits, remaining);
  return { planLine, covered, needed, remainingAfter: remaining - covered };
}

/**
 * Entrega una pieza al taller. Con `plan_id` la entrega es para un corte de la receta, se
 * valida contra él (coverCut) y se guarda cuántos cortes cubre, para que la receta muestre lo
 * que falta. Sin plan_id es una entrega libre, como siempre.
 *
 * Una pieza que ya está en el taller para ESTA orden puede cubrir además otro corte: de una
 * lámina salen a la vez el cuerpo y las puertas. No se entrega de nuevo; se le suma el corte.
 */
async function deliverPiece(req, id, { piece_id, plan_id } = {}) {
  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    mustBeOpen(order);

    const piece = await MaterialPiece.findOne({ where: { id: parseInt(piece_id) || 0, company_id: order.company_id }, transaction, lock: true });
    if (!piece) throw fail("Pieza no encontrada", 404);

    let use = null;
    if (piece.status === "en_taller") {
      use = await FabricationOrderPiece.findOne({ where: { order_id: order.id, piece_id: piece.id, returned_at: null }, transaction, lock: true });
      if (!use) throw fail(`La pieza #${piece.code} está en el taller para otra orden`);
      if (!plan_id) throw fail(`La pieza #${piece.code} ya está en el taller para esta orden`);
    } else if (piece.status !== "disponible") {
      throw fail(`La pieza #${piece.code} ya no está disponible`);
    }
    if (piece.warehouse_id !== order.warehouse_id) throw fail(`La pieza #${piece.code} está en otro almacén`);

    const cover = plan_id ? await coverCut(order, piece, use, plan_id, transaction) : null;
    const added = !!use;
    if (!use) {
      await piece.update({ status: "en_taller" }, { transaction });
      use = await FabricationOrderPiece.create({
        company_id: order.company_id,
        order_id: order.id,
        piece_id: piece.id,
        delivered_at: new Date(),
        delivered_by: employeeOf(req),
      }, { transaction });
    }
    if (cover) {
      await FabricationOrderCut.create({
        company_id: order.company_id, order_id: order.id, use_id: use.id, plan_id: cover.planLine.id, cuts: cover.covered,
      }, { transaction });
    }
    return {
      data: use.toJSON(), added,
      cuts_covered: cover?.covered ?? null, cuts_needed: cover?.needed ?? null, cuts_remaining: cover?.remainingAfter ?? null,
    };
  });
}

async function lockedUse(order, useId, transaction) {
  const use = await FabricationOrderPiece.findOne({ where: { id: parseInt(useId) || 0, order_id: order.id }, transaction, lock: true });
  if (!use) throw fail("Esa pieza no está en esta orden", 404);
  const piece = await MaterialPiece.findByPk(use.piece_id, { transaction, lock: true });
  const product = await Product.findByPk(piece.product_id, { attributes: ["id", "name", "piece_mode", "unit"], transaction });
  return { use, piece, mode: product?.piece_mode || (piece.width_mm ? "area" : "length") };
}

// La pieza vuelve tal cual, sin cortar: queda disponible y la orden la olvida.
async function cancelDelivery(req, id, useId) {
  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    mustBeOpen(order);
    const { use, piece } = await lockedUse(order, useId, transaction);
    if (use.returned_at) throw fail("Esa pieza ya se devolvió cortada: deshaz la devolución primero");
    await piece.update({ status: "disponible" }, { transaction });
    await use.destroy({ transaction });
    return { ok: true };
  });
}

/**
 * El dibujo de cómo se picó la pieza: zonas rectangulares en mm desde la esquina, cada una
 * 'usado' o 'retazo'. x corre a lo largo de la pieza (length_mm) e y a lo ancho (width_mm); en
 * tubos solo hay x. Las zonas no pueden salirse de la pieza ni encimarse. No hace falta que la
 * cubran entera: lo que no se dibuja cuenta como usado.
 *
 * Zonas 'retazo' con el mismo `group` son UN retazo (en el taller no se separaron): tienen
 * que tocarse. Si juntas forman un rectángulo, es un retazo normal; si no (una L), es irregular
 * con su forma (shape). Una pieza que ya tiene forma solo se dibuja dentro de sus partes.
 *
 * Devuelve las zonas y `pieces`: cada retazo con sus zonas y lo que se guarda de él.
 */
const MAX_REGIONS = 60;

const touches = (a, b, length) => {
  if (length) return a.x + a.dx === b.x || b.x + b.dx === a.x;
  const side = (a.x + a.dx === b.x || b.x + b.dx === a.x) && a.y < b.y + b.dy && b.y < a.y + a.dy;
  const top = (a.y + a.dy === b.y || b.y + b.dy === a.y) && a.x < b.x + b.dx && b.x < a.x + a.dx;
  return side || top;
};

function remnantSpec(rects, length) {
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const i = queue.shift();
    rects.forEach((r, j) => { if (!seen.has(j) && touches(rects[i], r, length)) { seen.add(j); queue.push(j); } });
  }
  if (seen.size !== rects.length) throw fail("Dibujo del corte: solo se unen pedazos que se tocan");

  const x0 = Math.min(...rects.map(r => r.x)), x1 = Math.max(...rects.map(r => r.x + r.dx));
  if (length) return { is_irregular: false, width_mm: null, length_mm: x1 - x0, size: sizeOf("length", null, x1 - x0), shape: null };
  const y0 = Math.min(...rects.map(r => r.y)), y1 = Math.max(...rects.map(r => r.y + r.dy));
  const w = y1 - y0, l = x1 - x0;
  const area = rects.reduce((sum, r) => sum + r.dx * r.dy, 0);
  if (area === w * l) return { is_irregular: false, width_mm: w, length_mm: l, size: sizeOf("area", w, l), shape: null };
  return {
    is_irregular: true, width_mm: w, length_mm: l, size: r3(area / 1e6),
    shape: rects.map(r => ({ x: r.x - x0, y: r.y - y0, dx: r.dx, dy: r.dy })),
  };
}

function parseLayout(layout, piece, mode) {
  const length = mode === "length";
  const shaped = !length && hasShape(piece);
  const L = piece.length_mm, W = length ? 0 : piece.width_mm;
  if ((piece.is_irregular && !shaped) || !L || (!length && !W)) throw fail(`La pieza #${piece.code} no tiene medidas para dibujar el corte`);
  const list = layout?.regions;
  if (!Array.isArray(list) || !list.length || list.length > MAX_REGIONS) throw fail("El dibujo del corte no es válido");

  const regions = list.map((r, i) => {
    const x = r?.x, dx = r?.dx;
    const y = length ? 0 : r?.y, dy = length ? 0 : r?.dy;
    const ok = [x, y, dx, dy].every(Number.isInteger) && x >= 0 && y >= 0 && dx >= 1 && (length || dy >= 1)
      && x + dx <= L && y + dy <= W && ["usado", "retazo"].includes(r?.kind);
    if (!ok) throw fail(`Dibujo del corte: la zona ${i + 1} no es válida o se sale de la pieza`);
    if (shaped && !piece.shape.some(p => x >= p.x && y >= p.y && x + dx <= p.x + p.dx && y + dy <= p.y + p.dy)) {
      throw fail(`Dibujo del corte: la zona ${i + 1} cae fuera de la forma de la pieza`);
    }
    const group = r.group ?? null;
    if (group !== null && (!Number.isInteger(group) || group < 1 || group > 1000 || r.kind !== "retazo")) {
      throw fail(`Dibujo del corte: la zona ${i + 1} no se puede unir a otra`);
    }
    return { x, y, dx, dy, kind: r.kind, ...(group !== null ? { group } : {}) };
  });
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i], b = regions[j];
      const overX = a.x < b.x + b.dx && b.x < a.x + a.dx;
      const overY = length || (a.y < b.y + b.dy && b.y < a.y + a.dy);
      if (overX && overY) throw fail("Dibujo del corte: hay zonas encimadas");
    }
  }

  const pieces = [];
  const index = new Map();
  regions.forEach((r, i) => {
    if (r.kind !== "retazo") return;
    const key = r.group != null ? `g${r.group}` : `z${i}`;
    if (!index.has(key)) { index.set(key, pieces.length); pieces.push({ regions: [] }); }
    pieces[index.get(key)].regions.push(r);
  });
  for (const p of pieces) p.spec = remnantSpec(p.regions, length);
  return { regions, pieces };
}

/**
 * Registra lo que volvió del taller. `remnants` son los retazos aprovechables:
 *   por área      { width_mm, length_mm }  o  { irregular: true, size } con su área aprox.
 *   por longitud  { length_mm }
 * Lista vacía = se gastó completa. Lo consumido es la pieza menos los retazos, y sale de la
 * existencia al costo unitario de la pieza de origen.
 *
 * Con `layout` (el dibujo, ver parseLayout) los retazos salen de sus zonas 'retazo' y lo que
 * llegue en `remnants` se ignora. El dibujo se guarda con el número de cada retazo.
 */
async function returnPiece(req, id, useId, { remnants = [], note, layout = null } = {}) {
  if (!Array.isArray(remnants)) throw fail("Retazos no válidos");
  if (remnants.length > 20) throw fail("Son demasiados retazos para una sola pieza");

  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    mustBeOpen(order);
    const { use, piece, mode } = await lockedUse(order, useId, transaction);
    if (use.returned_at) throw fail(`La devolución de la pieza #${piece.code} ya está registrada`);

    const drawing = layout != null ? parseLayout(layout, piece, mode) : null;
    if (drawing && drawing.pieces.length > 20) throw fail("Son demasiados retazos para una sola pieza");

    const parentSize = parseFloat(piece.size);
    const big = Math.max(piece.width_mm || 0, piece.length_mm || 0);
    const small = Math.min(piece.width_mm || 0, piece.length_mm || 0);

    const parsed = drawing ? drawing.pieces.map((p, i) => {
      if (!(p.spec.size > 0)) throw fail(`Retazo ${i + 1}: es demasiado chico para numerarlo`);
      return p.spec;
    }) : remnants.map((r, i) => {
      const label = `Retazo ${i + 1}`;
      if (!r || typeof r !== "object") throw fail(`${label}: no válido`);
      if (mode === "length") {
        const l = mm(r.length_mm, `${label}, largo`);
        if (l > piece.length_mm) throw fail(`${label}: ${l} mm es más largo que la pieza #${piece.code} (${piece.length_mm} mm)`);
        return { is_irregular: false, width_mm: null, length_mm: l, size: sizeOf(mode, null, l) };
      }
      if (r.irregular === true) {
        const size = r3(r.size);
        if (!(size > 0)) throw fail(`${label}: escribe su área aproximada`);
        return { is_irregular: true, width_mm: null, length_mm: null, size };
      }
      const w = mm(r.width_mm, `${label}, ancho`);
      const l = mm(r.length_mm, `${label}, largo`);
      if (!piece.is_irregular && (Math.max(w, l) > big || Math.min(w, l) > small)) {
        throw fail(`${label}: ${w} × ${l} mm no cabe en la pieza #${piece.code} (${piece.width_mm} × ${piece.length_mm} mm)`);
      }
      return { is_irregular: false, width_mm: w, length_mm: l, size: sizeOf(mode, w, l) };
    });

    const back = r3(parsed.reduce((s, r) => s + r.size, 0));
    if (back > parentSize + TOL) {
      throw fail(`Los retazos suman ${back.toLocaleString("es-VE")} y la pieza #${piece.code} tenía ${parentSize.toLocaleString("es-VE")}`);
    }
    const consumed = Math.max(0, r3(parentSize - back));
    if (consumed <= 0) throw fail("No se consumió nada: si la pieza volvió sin cortar, usa Volvió sin cortar");

    // Los retazos se numeran a continuación del mayor que haya tenido la pieza, contando los
    // anulados al deshacer una devolución: un número no se reutiliza, porque su etiqueta pudo
    // quedar pegada en el material.
    const hijos = await MaterialPiece.findAll({ where: { parent_id: piece.id }, attributes: ["code"], transaction });
    const start = hijos.reduce((m, c) => Math.max(m, parseInt(c.code.split("-").pop()) || 0), 0);
    for (let i = 0; i < parsed.length; i++) {
      await MaterialPiece.create({
        company_id: piece.company_id,
        product_id: piece.product_id,
        warehouse_id: piece.warehouse_id,
        code: `${piece.code}-${start + i + 1}`,
        root_number: piece.root_number,
        parent_id: piece.id,
        ...parsed[i],
        unit_cost: piece.unit_cost,
        status: "disponible",
        origin: "retazo",
        source_order_id: order.id,
        employee_id: employeeOf(req),
      }, { transaction });
    }

    // Cada zona 'retazo' del dibujo con el número de su retazo (las unidas comparten número).
    if (drawing) {
      drawing.pieces.forEach((p, i) => { for (const r of p.regions) r.code = `${piece.code}-${start + i + 1}`; });
    }

    const cost = r4(consumed * parseFloat(piece.unit_cost || 0));
    await piece.update({ status: "consumida", closed_at: new Date() }, { transaction });
    await use.update({
      returned_at: new Date(),
      returned_by: employeeOf(req),
      consumed,
      cost,
      note: text(note, 2000),
      layout: drawing ? { regions: drawing.regions } : null,
    }, { transaction });

    await moveStock({
      productId: piece.product_id, warehouseId: piece.warehouse_id, delta: -consumed,
      req, transaction, notes: `${orderCode(order.number)} · pieza #${piece.code}`,
    });

    await order.update({ material_cost: r4(parseFloat(order.material_cost) + cost) }, { transaction });
    await syncSaleCost(order, transaction);
    return { consumed, cost };
  });
}

// Corrige una devolución mal anotada mientras sus retazos sigan intactos.
async function undoReturn(req, id, useId) {
  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    mustBeOpen(order);
    const { use, piece } = await lockedUse(order, useId, transaction);
    if (!use.returned_at) throw fail("Esa pieza todavía no se ha devuelto");

    // Los retazos de ESTA devolución (los anulados en una corrección anterior ya no cuentan).
    const children = await MaterialPiece.findAll({
      where: { parent_id: piece.id, source_order_id: order.id, status: { [Op.ne]: "anulada" } },
      transaction, lock: true,
    });
    const touched = children.find(c => c.status !== "disponible");
    if (touched) throw fail(`El retazo #${touched.code} ya se usó o se dio de baja: no se puede deshacer`);
    if (children.length) {
      const used = await FabricationOrderPiece.count({ where: { piece_id: { [Op.in]: children.map(c => c.id) } }, transaction });
      if (used) throw fail("Uno de los retazos ya pasó por otra orden: no se puede deshacer");
      // No se borran: quedan anulados con su número, que no se vuelve a usar. Su existencia
      // ya no cuenta, y la pieza madre vuelve a estar entera en el taller, así que el saldo
      // cuadra sin mover más stock que lo consumido.
      await MaterialPiece.update(
        { status: "anulada", closed_at: new Date(), notes: `Se deshizo la devolución en ${orderCode(order.number)}` },
        { where: { id: { [Op.in]: children.map(c => c.id) } }, transaction }
      );
    }

    const consumed = parseFloat(use.consumed || 0);
    const cost = parseFloat(use.cost || 0);
    await moveStock({
      productId: piece.product_id, warehouseId: piece.warehouse_id, delta: consumed,
      req, transaction, notes: `${orderCode(order.number)} · se deshizo la devolución de #${piece.code}`,
    });
    await piece.update({ status: "en_taller", closed_at: null }, { transaction });
    await use.update({ returned_at: null, returned_by: null, consumed: null, cost: null, note: null, layout: null }, { transaction });
    await order.update({ material_cost: r4(Math.max(0, parseFloat(order.material_cost) - cost)) }, { transaction });
    await syncSaleCost(order, transaction);
    return { ok: true };
  });
}

// ── Accesorios ──────────────────────────────────────────────────────────────────────────

async function addItem(req, id, { product_id, quantity } = {}) {
  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    mustBeOpen(order);

    const product = await Product.findByPk(parseInt(product_id) || 0, { transaction });
    if (!product) throw fail("Producto no encontrado", 404);
    if (product.piece_mode) throw fail("Los materiales por piezas se entregan como pieza, no como accesorio");
    if (product.is_combo || product.is_service || product.is_variant_parent) throw fail(`"${product.name}" no maneja existencia`);
    const qty = parseQuantity(quantity, product);

    const item = await consumeAccessory(order, product, qty, req, transaction);
    await syncSaleCost(order, transaction);
    return { data: item.toJSON() };
  });
}

async function removeItem(req, id, itemId) {
  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    mustBeOpen(order);
    const item = await FabricationOrderItem.findOne({ where: { id: parseInt(itemId) || 0, order_id: order.id }, transaction, lock: true });
    if (!item) throw fail("Accesorio no encontrado", 404);

    const qty = parseFloat(item.quantity);
    await moveStock({
      productId: item.product_id, warehouseId: order.warehouse_id, delta: qty,
      req, transaction, notes: `${orderCode(order.number)} · se quitó el accesorio`,
    });
    await order.update({
      accessories_cost: r4(Math.max(0, parseFloat(order.accessories_cost) - qty * parseFloat(item.unit_cost))),
    }, { transaction });
    await item.destroy({ transaction });
    await syncSaleCost(order, transaction);
    return { ok: true };
  });
}

// ── Etapas del taller ───────────────────────────────────────────────────────────────────

function parseMinutes(value) {
  if (value == null || value === "") return null;
  const m = r2(String(value).replace(",", "."));
  if (!(m >= 0) || m > 100000) throw fail("Los minutos no son válidos");
  return m;
}

/**
 * Cierra la etapa en que está la orden: anota los minutos (los tecleados, o los que la receta
 * asigna a esa etapa) y quién la hizo, y suma la mano de obra a la orden al costo por hora
 * que tenía la etapa al entrar.
 */
async function closeOpenStage(order, { minutes, worker, note } = {}, req, transaction) {
  const open = await FabricationOrderStage.findOne({ where: { order_id: order.id, finished_at: null }, transaction, lock: true });
  if (!open) return null;
  let mins = parseMinutes(minutes);
  if (mins == null) mins = (await plannedMinutes(order, transaction)).get(open.stage_id) || 0;
  const cost = r4((mins / 60) * parseFloat(open.cost_per_hour || 0));
  await open.update({
    finished_at: new Date(), minutes: mins, cost,
    worker: text(worker, 80) || open.worker || order.assignee || null,
    note: text(note, 300) || open.note,
    employee_id: employeeOf(req),
  }, { transaction });
  await order.update({ labor_cost: r4(parseFloat(order.labor_cost || 0) + cost) }, { transaction });
  return open;
}

/**
 * Pasa la orden a otra etapa del tablero. La etapa actual se cierra con su tiempo; la nueva
 * se abre con el costo por hora de hoy.
 */
async function moveStage(req, id, body = {}) {
  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    mustBeOpen(order);
    const target = await FabricationStage.findOne({
      where: { id: parseInt(body.stage_id) || 0, company_id: order.company_id, active: true }, transaction,
    });
    if (!target) throw fail("Elige una etapa activa", 404);
    if (order.current_stage_id === target.id) throw fail(`La orden ya está en ${target.name}`);

    await closeOpenStage(order, body, req, transaction);
    await FabricationOrderStage.create({
      company_id: order.company_id, order_id: order.id, stage_id: target.id, stage_name: target.name,
      started_at: new Date(), cost_per_hour: target.cost_per_hour,
      worker: text(body.next_worker, 80) || null, employee_id: employeeOf(req),
    }, { transaction });
    await order.update({ current_stage_id: target.id }, { transaction });
    await syncSaleCost(order, transaction);
    return { data: { current_stage_id: target.id } };
  });
}

// ── Cierre ──────────────────────────────────────────────────────────────────────────────

async function finishOrder(req, id, body = {}) {
  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    mustBeOpen(order);
    parseMinutes(body.minutes);   // valida antes de mover nada

    const pending = await FabricationOrderPiece.count({ where: { order_id: order.id, returned_at: null }, transaction });
    if (pending) throw fail(`Hay ${pending} pieza(s) en el taller: registra lo que volvió antes de terminar`);

    // Estándar: lo que la receta pide de accesorios y no se anotó a mano sale ahora. Es lo que
    // hace que un producto que siempre lleva lo mismo no haya que cargarlo pieza por pieza.
    const auto = [];
    const plan = (await planLines(order.id, transaction)).filter(l => l.kind === "accesorio");
    if (plan.length) {
      const items = await FabricationOrderItem.findAll({ where: { order_id: order.id }, transaction });
      const needed = new Map();
      for (const l of plan) needed.set(l.component_id, r3((needed.get(l.component_id) || 0) + l.quantity * parseFloat(order.quantity)));
      for (const [componentId, total] of needed) {
        const already = items.filter(i => i.product_id === componentId).reduce((sum, i) => sum + parseFloat(i.quantity), 0);
        const missing = r3(total - already);
        if (missing <= 0) continue;
        const product = await Product.findByPk(componentId, { transaction });
        if (!product) continue;
        await consumeAccessory(order, product, missing, req, transaction, "accesorio de la receta");
        auto.push({ product: product.name, quantity: missing });
      }
      if (auto.length) await syncSaleCost(order, transaction);
    }

    // La etapa en curso se cierra con su tiempo: la mano de obra entra al costo antes de que
    // lo terminado pase al inventario con ese costo.
    await closeOpenStage(order, body, req, transaction);
    await syncSaleCost(order, transaction);

    if (order.destination === "stock") {
      const cost = unitCost(order);
      await moveStock({
        productId: order.product_id, warehouseId: order.warehouse_id, delta: parseFloat(order.quantity),
        req, transaction, notes: `${orderCode(order.number)} · producto terminado`,
        setCost: cost > 0 ? cost : null,
      });
    }
    await order.update({ status: "terminada", finished_at: new Date(), current_stage_id: null }, { transaction });
    return { data: order.toJSON(), auto_accessories: auto };
  });
}

// Vuelve a abrir una orden terminada para corregirla. Lo que entró al inventario sale.
async function reopenOrder(req, id) {
  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    if (order.status !== "terminada") throw fail("Solo se reabre una orden terminada");
    if (order.destination === "stock") {
      await moveStock({
        productId: order.product_id, warehouseId: order.warehouse_id,
        delta: -parseFloat(order.quantity), req, transaction, notes: `${orderCode(order.number)} · se reabrió la orden`,
      });
    }
    await order.update({ status: "abierta", finished_at: null }, { transaction });
    return { data: order.toJSON() };
  });
}

// Anular solo vale mientras no se haya cortado nada: las piezas en el taller vuelven
// disponibles y los accesorios regresan al stock.
async function cancelOrder(req, id, { reason } = {}) {
  const motivo = text(reason, 300);
  if (!motivo) throw fail("Escribe el motivo de la anulación");

  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    mustBeOpen(order);
    if (await activeSale(order, transaction)) throw fail("La orden está facturada: anula primero la factura");

    const uses = await FabricationOrderPiece.findAll({ where: { order_id: order.id }, transaction, lock: true });
    if (uses.some(u => u.returned_at)) {
      throw fail("La orden ya consumió material: deshaz las devoluciones antes de anularla");
    }
    // Lo trabajado hasta aquí ya se cargó; la etapa abierta se cierra sin minutos.
    await closeOpenStage(order, { minutes: 0, note: "Orden anulada" }, req, transaction);
    await order.update({ current_stage_id: null }, { transaction });
    for (const u of uses) {
      await MaterialPiece.update({ status: "disponible" }, { where: { id: u.piece_id }, transaction });
      await u.destroy({ transaction });
    }

    const items = await FabricationOrderItem.findAll({ where: { order_id: order.id }, transaction, lock: true });
    for (const it of items) {
      await moveStock({
        productId: it.product_id, warehouseId: order.warehouse_id, delta: parseFloat(it.quantity),
        req, transaction, notes: `${orderCode(order.number)} · orden anulada`,
      });
      await it.destroy({ transaction });
    }

    await order.update({
      status: "anulada", cancelled_at: new Date(), cancel_reason: motivo,
      accessories_cost: 0,
    }, { transaction });
    return { data: order.toJSON() };
  });
}

/**
 * Factura una orden para cliente. Queda como venta por cobrar ('pendiente') con su
 * correlativo, igual que una cotización convertida; el cobro sigue por Cobro o Cuentas.
 *
 * La línea va sin product_id a propósito: lo fabricado nunca estuvo en el inventario (el
 * material ya salió al registrar la devolución), y una línea con producto haría que el kardex
 * contara una salida que no ocurrió. El costo sí va, para el reporte de márgenes.
 *
 * El precio del lote se reparte por unidad con los cinco decimales de los precios, y el total
 * de la factura es la suma de la línea: lo que se guarda en la orden es ese total, no lo
 * tecleado, para que orden, factura y cobro digan la misma cifra.
 */
async function invoiceOrder(req, id, { serie_id, sale_price } = {}) {
  return inTransaction(async (transaction) => {
    const order = await lockedOrder(req, id, transaction);
    if (order.status === "anulada") throw fail("La orden está anulada");
    if (order.destination !== "cliente") throw fail("Esta orden es para el inventario: lo fabricado se vende desde la caja");
    if (await activeSale(order, transaction)) throw fail("La orden ya está facturada");
    if (!order.customer_id) throw fail("Asígnale un cliente a la orden antes de facturarla");

    const price = money(sale_price ?? order.sale_price, "Precio del lote", { allowNull: false });
    if (!(price > 0)) throw fail("Escribe el precio del lote");

    const serie = await Serie.findByPk(parseInt(serie_id) || 0, { transaction });
    if (!serie || !serie.active) throw fail("Elige una serie activa");
    if (serie.type && serie.type !== "factura") throw fail("Esa serie es de notas de crédito: elige una de facturas");
    if (serie.warehouse_id && parseInt(serie.warehouse_id) !== parseInt(order.warehouse_id)) {
      throw fail("La serie elegida no pertenece al almacén de la orden");
    }

    const qty = parseFloat(order.quantity);
    const unitPrice = r5(price / qty);
    const total = r5(unitPrice * qty);

    const sale = await Sale.create({
      total,
      paid: 0,
      change: 0,
      customer_id: order.customer_id,
      employee_id: employeeOf(req),
      currency_id: null,
      exchange_rate: 1,
      discount_amount: 0,
      payment_method: "efectivo",
      warehouse_id: order.warehouse_id,
      serie_id: serie.id,
      status: "pendiente",
    }, { transaction });
    await assignInvoiceNumber(sale, transaction);

    await SaleItem.create({
      sale_id: sale.id,
      product_id: null,
      name: order.description.slice(0, 200),
      price: unitPrice,
      quantity: qty,
      discount: 0,
      cost_price: unitCost(order),
      note: orderCode(order.number),
    }, { transaction });

    await order.update({ sale_id: sale.id, sale_price: total, invoiced_at: new Date() }, { transaction });
    return { data: { sale_id: sale.id, invoice_number: sale.invoice_number, total } };
  });
}

module.exports = {
  listOrders, getOrder, createOrder, updateOrder,
  deliverPiece, cancelDelivery, returnPiece, undoReturn,
  addItem, removeItem, finishOrder, reopenOrder, cancelOrder, invoiceOrder, moveStage,
};
