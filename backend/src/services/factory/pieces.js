'use strict';

const {
  sequelize, Sequelize, Op, Product, ProductStock, MaterialPiece,
  fail, r3, r4, TOL, MAX_MONEY, unitOfMode, pieceSpec, mm, money, text,
  companyOf, employeeOf, ownWarehouse, moveStock, inTransaction, COST_ANY_SQL,
  assertWarehouseAccess, visibleWarehouseIds,
} = require("./shared");
const { ACTIVE, createNumberedPieces, pieceConfigChanges } = require("./numbering");

const QT = Sequelize.QueryTypes;

// ── Materiales ──────────────────────────────────────────────────────────────────────────
// Un material es un producto del catálogo con control por piezas. Su existencia la llevan
// compras, ajustes y ventas como siempre; aquí se compara con lo que está numerado.
async function listMaterials(req, { warehouse_id } = {}) {
  const company = companyOf(req);
  const visibles = await visibleWarehouseIds(req);
  const wid = warehouse_id ? await ownWarehouse(req, warehouse_id) : null;

  const rows = await sequelize.query(`
    SELECT p.id, p.name, p.unit, p.piece_mode, p.piece_width_mm, p.piece_length_mm,
           ${COST_ANY_SQL("p")}::float AS cost_price,
           COALESCE((SELECT SUM(ps.qty) FROM product_stock ps
                      WHERE ps.product_id = p.id
                        AND (CAST(:wid AS int) IS NULL OR ps.warehouse_id = :wid)
                        AND (:all OR ps.warehouse_id IN (:visibles))), 0)::float AS stock,
           COALESCE(SUM(mp.size), 0)::float AS numbered,
           COUNT(mp.id) FILTER (WHERE mp.status = 'disponible')::int AS available,
           COUNT(mp.id) FILTER (WHERE mp.status = 'en_taller')::int  AS in_shop
      FROM products p
      LEFT JOIN material_pieces mp
             ON mp.product_id = p.id AND mp.status IN ('disponible', 'en_taller')
            AND (CAST(:wid AS int) IS NULL OR mp.warehouse_id = :wid)
            AND (:all OR mp.warehouse_id IN (:visibles))
     WHERE p.company_id = :company AND p.piece_mode IS NOT NULL
     GROUP BY p.id
     ORDER BY p.name`, {
    replacements: { company, wid, all: visibles === null, visibles: visibles?.length ? visibles : [0] },
    type: QT.SELECT,
  });

  return { data: rows.map(r => ({ ...r, unnumbered: r3(r.stock - r.numbered) })) };
}

// Crea un material nuevo (un producto de insumo) o configura el control por piezas de uno
// que ya está en el catálogo. Es el mismo dato que la ficha del producto edita.
//
// `warehouse_id` le abre la ficha en ese almacén, como hace Catálogo al crear un producto. Sin
// ella el material existía pero no aparecía en el Catálogo ni en el stock de ninguna sucursal
// hasta la primera compra.
async function saveMaterial(req, body = {}) {
  const company = companyOf(req);
  return inTransaction(async (transaction) => {
    const wid = body.warehouse_id ? await ownWarehouse(req, body.warehouse_id, transaction) : null;
    const abrirFicha = (productId) => wid && ProductStock.findOrCreate({
      where: { product_id: productId, warehouse_id: wid },
      defaults: { qty: 0, company_id: company },
      transaction,
    });

    if (body.product_id) {
      const product = await Product.findByPk(body.product_id, { transaction, lock: true });
      if (!product) throw fail("Producto no encontrado", 404);
      const changes = await pieceConfigChanges(product, body, transaction);
      if (!changes.piece_mode && !product.piece_mode) throw fail("Elige si se controla por área o por longitud");
      const name = text(body.name, 200);
      if (name) changes.name = name;
      await product.update(changes, { transaction });
      await abrirFicha(product.id);
      return { data: product.toJSON() };
    }

    const name = text(body.name, 200);
    if (!name) throw fail("Escribe el nombre del material (por ejemplo, Lámina inox 304 cal. 18)");
    const changes = await pieceConfigChanges(null, body, transaction);
    if (!changes.piece_mode) throw fail("Elige si se controla por área o por longitud");
    const product = await Product.create({
      name,
      price: 0,
      sellable: false,
      ...changes,
    }, { transaction });
    await abrirFicha(product.id);
    return { data: product.toJSON() };
  });
}

// ── Piezas ──────────────────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ["activas", "todas", "disponible", "en_taller", "consumida", "baja"];

async function listPieces(req, q = {}) {
  const company = companyOf(req);
  const visibles = await visibleWarehouseIds(req);
  const where = ["mp.company_id = :company"];
  const rep = { company };

  if (visibles !== null) { where.push("mp.warehouse_id IN (:visibles)"); rep.visibles = visibles.length ? visibles : [0]; }
  if (q.warehouse_id) { where.push("mp.warehouse_id = :wid"); rep.wid = await ownWarehouse(req, q.warehouse_id); }
  if (q.product_id)   { where.push("mp.product_id = :pid"); rep.pid = parseInt(q.product_id) || 0; }

  const status = STATUS_FILTERS.includes(q.status) ? q.status : "activas";
  if (status === "activas") where.push("mp.status IN ('disponible', 'en_taller')");
  else if (status !== "todas") { where.push("mp.status = :status"); rep.status = status; }

  if (q.search && String(q.search).trim()) {
    // "#51" o "51" trae la pieza y todos sus retazos; "51-2" solo esa rama.
    const s = String(q.search).trim().replace(/^#/, "").slice(0, 40);
    where.push("(mp.code = :s OR mp.code LIKE :prefix)");
    rep.s = s; rep.prefix = `${s.replace(/[%_\\]/g, "\\$&")}-%`;
  }

  // ¿Dónde cabe un corte? Por área, rectángulos que lo contengan (también girado); las piezas
  // con forma (retazo en L), si cabe en alguna de sus partes; las irregulares sin forma solo por
  // tamaño, al final, para que alguien las mida. Por longitud, el largo.
  let order = "mp.root_number DESC, mp.code";
  if (q.fit_l) {
    rep.fl = mm(q.fit_l, "Largo buscado");
    if (q.fit_w) {
      rep.fw = mm(q.fit_w, "Ancho buscado");
      rep.fsize = r3((rep.fw * rep.fl) / 1e6);
      where.push(`p.piece_mode = 'area' AND (
        (mp.is_irregular = false AND ((mp.width_mm >= :fw AND mp.length_mm >= :fl) OR (mp.width_mm >= :fl AND mp.length_mm >= :fw)))
        OR (mp.shape IS NOT NULL AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(mp.shape) s
               WHERE ((s->>'dy')::int >= :fw AND (s->>'dx')::int >= :fl) OR ((s->>'dy')::int >= :fl AND (s->>'dx')::int >= :fw)))
        OR (mp.is_irregular = true AND mp.shape IS NULL AND mp.size >= :fsize))`);
    } else {
      where.push("p.piece_mode = 'length' AND mp.length_mm >= :fl");
    }
    order = "(mp.is_irregular AND mp.shape IS NULL), mp.size ASC, mp.code";
  }

  const limit = Math.min(Math.max(parseInt(q.limit) || 100, 1), 300);
  const rows = await sequelize.query(`
    SELECT mp.id, mp.code, mp.root_number, mp.parent_id, mp.product_id, mp.warehouse_id,
           mp.width_mm, mp.length_mm, mp.is_irregular, mp.shape, mp.size::float AS size,
           mp.unit_cost::float AS unit_cost, mp.status, mp.origin, mp.reference,
           mp.created_at, mp.closed_at,
           p.name AS product_name, p.piece_mode, p.unit, w.name AS warehouse_name,
           op.order_id AS shop_order_id, fo.number AS shop_order_number, fo.description AS shop_order_description
      FROM material_pieces mp
      JOIN products p   ON p.id = mp.product_id
      JOIN warehouses w ON w.id = mp.warehouse_id
      LEFT JOIN fabrication_order_pieces op ON op.piece_id = mp.id AND op.returned_at IS NULL
      LEFT JOIN fabrication_orders fo ON fo.id = op.order_id
     WHERE ${where.join(" AND ")}
     ORDER BY ${order}
     LIMIT ${limit}`, { replacements: rep, type: QT.SELECT });

  return { data: rows };
}

/**
 * Numera piezas que no entraron por una compra con medidas (esas se numeran solas al
 * recibirse, ver numbering.js):
 *
 *   carga_inicial  piezas que ya estaban antes del sistema: se numeran y entran a la existencia.
 *   existencia     material que ya está en la existencia sin número (una compra vieja, un
 *                  ajuste): solo se numera, si alcanza lo que hay sin numerar.
 */
async function registerPieces(req, body = {}) {
  companyOf(req);
  const count = parseInt(body.count);
  if (!count || count < 1 || count > 200) throw fail("Indica cuántas piezas son (de 1 a 200)");
  const origin = body.origin === "existencia" ? "existencia" : "carga_inicial";
  const reference = text(body.reference, 80);
  const notes = text(body.notes, 2000);
  const costPerPiece = money(body.cost_per_piece, "Costo por pieza");

  // Número propio: quien ya numeraba a mano sigue con sus números (ver createNumberedPieces).
  let firstNumber = null;
  if (body.first_number != null && body.first_number !== "") {
    if (origin !== "carga_inicial") throw fail("El número propio solo aplica a la carga inicial");
    firstNumber = Number(body.first_number);
    if (!Number.isInteger(firstNumber) || firstNumber < 1 || firstNumber + count - 1 > 999999) {
      throw fail("Número inicial: escribe un número entero desde 1");
    }
  }

  return inTransaction(async (transaction) => {
    const warehouseId = await ownWarehouse(req, body.warehouse_id, transaction);
    const product = await Product.findByPk(body.product_id, { transaction, lock: true });
    if (!product || !product.piece_mode) throw fail("Elige un material que se controle por piezas");
    const spec = pieceSpec(product.piece_mode, body.width_mm, body.length_mm);

    const stock = await ProductStock.findOne({ where: { product_id: product.id, warehouse_id: warehouseId }, transaction, lock: true });
    const stockQty = parseFloat(stock?.qty || 0);

    // Costo por unidad del producto (m² o m): el de la pieza tecleado, o el de la última
    // compra de esa sucursal.
    const unitCost = costPerPiece != null
      ? r4(costPerPiece / spec.size)
      : r4(stock?.cost_price ?? product.cost_price ?? 0);
    if (unitCost > MAX_MONEY) throw fail("El costo es demasiado grande");

    const total = r3(count * spec.size);
    if (origin === "existencia") {
      const numbered = parseFloat(await MaterialPiece.sum("size", {
        where: { product_id: product.id, warehouse_id: warehouseId, status: { [Op.in]: ACTIVE } },
        transaction,
      }) || 0);
      const free = r3(stockQty - numbered);
      if (total > free + TOL) {
        throw fail(
          `En ese almacén hay ${free.toLocaleString("es-VE")} ${product.unit} de ${product.name} sin numerar y ` +
          `estas piezas suman ${total.toLocaleString("es-VE")}. Usa Carga inicial si estaban antes del sistema.`
        );
      }
    }

    const out = await createNumberedPieces({
      product, warehouseId, count, widthMm: spec.width_mm, lengthMm: spec.length_mm, unitCost,
      origin, reference, notes, employeeId: employeeOf(req), firstNumber,
    }, transaction);

    if (origin === "carga_inicial") {
      await moveStock({
        productId: product.id, warehouseId, delta: total, req, transaction,
        notes: count === 1 ? `Carga inicial pieza #${out.first}` : `Carga inicial piezas #${out.first} a #${out.last}`,
        setCost: stock?.cost_price == null ? unitCost : null,
      });
    }

    return { data: out.pieces.map(p => p.toJSON()), first: out.first, last: out.last };
  });
}

// Una pieza con todo el árbol de su número: de dónde salió cada retazo y en qué orden se usó.
async function getPiece(req, id) {
  const company = companyOf(req);
  const piece = await MaterialPiece.findOne({ where: { id: parseInt(id) || 0, company_id: company } });
  if (!piece) throw fail("Pieza no encontrada", 404);
  await assertWarehouseAccess(req, piece.warehouse_id);

  const tree = await sequelize.query(`
    SELECT mp.id, mp.code, mp.parent_id, mp.width_mm, mp.length_mm, mp.is_irregular, mp.shape,
           mp.size::float AS size, mp.unit_cost::float AS unit_cost, mp.status, mp.origin,
           mp.reference, mp.notes, mp.created_at, mp.closed_at, mp.source_order_id,
           p.name AS product_name, p.piece_mode, p.unit, w.name AS warehouse_name, e.full_name AS employee_name,
           op.id AS use_id, op.order_id AS use_order_id, op.delivered_at, op.returned_at,
           op.consumed::float AS consumed, op.cost::float AS use_cost, op.note AS use_note, op.layout AS use_layout,
           fo.number AS use_order_number, fo.description AS use_order_description,
           fo.status AS use_order_status, c.name AS use_customer_name
      FROM material_pieces mp
      JOIN products p   ON p.id = mp.product_id
      JOIN warehouses w ON w.id = mp.warehouse_id
      LEFT JOIN employees e ON e.id = mp.employee_id
      LEFT JOIN fabrication_order_pieces op ON op.piece_id = mp.id
      LEFT JOIN fabrication_orders fo ON fo.id = op.order_id
      LEFT JOIN customers c ON c.id = fo.customer_id
     WHERE mp.company_id = :company AND mp.root_number = :root
     ORDER BY mp.id, op.id`, {
    replacements: { company, root: piece.root_number },
    type: QT.SELECT,
  });

  return { data: { id: piece.id, root_number: piece.root_number, tree } };
}

// Dar de baja una pieza disponible (se dañó, se vendió como chatarra, se registró por error):
// sale de la existencia con su motivo.
async function dischargePiece(req, id, { reason } = {}) {
  const company = companyOf(req);
  const motivo = text(reason, 300);
  if (!motivo) throw fail("Escribe el motivo de la baja");

  return inTransaction(async (transaction) => {
    const piece = await MaterialPiece.findOne({ where: { id: parseInt(id) || 0, company_id: company }, transaction, lock: true });
    if (!piece) throw fail("Pieza no encontrada", 404);
    await assertWarehouseAccess(req, piece.warehouse_id);
    if (piece.status !== "disponible") throw fail("Solo se da de baja una pieza disponible");

    await piece.update({ status: "baja", closed_at: new Date(), notes: motivo }, { transaction });
    await moveStock({
      productId: piece.product_id, warehouseId: piece.warehouse_id, delta: -parseFloat(piece.size),
      req, transaction, notes: `Baja pieza #${piece.code}: ${motivo}`,
    });
    return { data: piece.toJSON() };
  });
}

module.exports = { listMaterials, saveMaterial, listPieces, registerPieces, getPiece, dischargePiece, unitOfMode };
