// Movimientos de un producto (kardex): cada entrada y salida de inventario con su documento,
// quién la hizo y cómo quedó la existencia después.
//
// No hay una tabla de movimientos: el historial se reconstruye desde los documentos que
// mueven stock, que es donde ya vive la verdad de cada operación.
//
//   venta                 sale_items (y los combos que lo llevan, por su receta actual)
//   devolucion            return_items de la NC; si la NC se anuló, una salida en annulled_at
//   compra                líneas de sesión que escribe la recepción ("Compra #N"); las compras
//                         anteriores a ese registro salen de purchase_items.received_units
//   ajuste                líneas de sesión de Movimiento manual y del ajuste directo de Stock
//   transferencia         salida al despachar, entrada al recibir, retorno del faltante y anulación
//
// Una venta anulada devolvió lo que sacó, pero `sales` no guarda cuándo: se muestra marcada
// y no cuenta para el saldo (su efecto neto es cero).
//
// El saldo se calcula hacia atrás desde la existencia real de hoy: saldo tras un movimiento =
// existencia actual − todo lo que se movió después. Así la última fila siempre cuadra con el
// stock, y lo que ningún documento explica (cargas iniciales, importaciones) aparece como
// existencia inicial en vez de descuadrar las filas recientes.
const { sequelize, Sequelize, Product } = require('../../models');
const { assertWarehouseAccess } = require('../../middleware/auth');
const { imageUrl } = require('../../utils/imageStorage');
const { TZ, sanitizeDate } = require('../reports/shared');

const GRUPOS = ['venta', 'devolucion', 'compra', 'ajuste', 'transferencia'];

const esAdmin = (req) => !!(req.is_superuser || req.employee?.permissions?.all);

// Almacenes de la empresa que el usuario puede ver, opcionalmente uno solo. Va como subconsulta
// y no como lista de ids traída a Node.
const SCOPE_SQL = `
  SELECT w.id, w.name FROM warehouses w
  WHERE w.company_id = :cid
    AND (CAST(:wid AS int) IS NULL OR w.id = CAST(:wid AS int))
    AND (CAST(:eid AS int) IS NULL OR w.id IN (
          SELECT ew.warehouse_id FROM employee_warehouses ew WHERE ew.employee_id = CAST(:eid AS int)))`;

// Todas las fuentes, con las mismas columnas. `src` + `src_id` desempatan el orden de filas
// con la misma hora (p. ej. dos líneas del mismo producto en una venta).
const MOV_SQL = `
  -- Ventas del producto
  SELECT s.created_at AS at, s.warehouse_id, -si.quantity::numeric AS qty,
         'venta'::text AS kind, NULL::text AS reason,
         s.invoice_number::text AS doc, s.id AS doc_id,
         COALESCE(c.name, s.web_customer_name)::text AS party,
         s.employee_id, NULL::text AS notes, NULL::text AS via,
         (s.status = 'anulado') AS void, s.status::text AS doc_status,
         1 AS src, si.id AS src_id
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN customers c ON c.id = s.customer_id
   WHERE si.product_id = :pid AND s.status <> 'pedido'
  UNION ALL
  -- Ventas de combos que lo llevan como ingrediente
  SELECT s.created_at, s.warehouse_id, -(si.quantity * ci.quantity),
         'venta', NULL, s.invoice_number, s.id,
         COALESCE(c.name, s.web_customer_name),
         s.employee_id, NULL, si.name,
         (s.status = 'anulado'), s.status,
         2, si.id
    FROM product_combo_items ci
    JOIN sale_items si ON si.product_id = ci.combo_id
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN customers c ON c.id = s.customer_id
   WHERE ci.product_id = :pid AND s.status <> 'pedido'
  UNION ALL
  -- Devoluciones (NC). Una NC anulada sin fecha de anulación es de antes de guardarla: su
  -- efecto neto es cero y se marca como la venta anulada.
  SELECT r.created_at, s.warehouse_id, ri.qty * COALESCE(ci.quantity, 1),
         'devolucion', r.reason, r.nc_number, r.id,
         COALESCE(c.name, s.web_customer_name),
         r.employee_id, NULL, CASE WHEN ci.id IS NOT NULL THEN ri.name END,
         (r.status = 'anulado' AND r.annulled_at IS NULL), r.status,
         CASE WHEN ci.id IS NULL THEN 3 ELSE 4 END, ri.id
    FROM return_items ri
    JOIN returns r ON r.id = ri.return_id
    JOIN sales s ON s.id = r.sale_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN product_combo_items ci ON ci.combo_id = ri.product_id AND ci.product_id = :pid
   WHERE ri.product_id = :pid OR ci.id IS NOT NULL
  UNION ALL
  -- NC anulada: lo devuelto vuelve a salir del almacén
  SELECT r.annulled_at, s.warehouse_id, -(ri.qty * COALESCE(ci.quantity, 1)),
         'devolucion_anulada', r.reason, r.nc_number, r.id,
         COALESCE(c.name, s.web_customer_name),
         r.annulled_by, NULL, CASE WHEN ci.id IS NOT NULL THEN ri.name END,
         false, r.status,
         CASE WHEN ci.id IS NULL THEN 5 ELSE 6 END, ri.id
    FROM return_items ri
    JOIN returns r ON r.id = ri.return_id
    JOIN sales s ON s.id = r.sale_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN product_combo_items ci ON ci.combo_id = ri.product_id AND ci.product_id = :pid
   WHERE (ri.product_id = :pid OR ci.id IS NOT NULL)
     AND r.status = 'anulado' AND r.annulled_at IS NOT NULL
  UNION ALL
  -- Líneas de sesión: ajustes manuales, ajuste directo y recepción de compras
  SELECT l.created_at, l.warehouse_id, l.qty_adjusted,
         CASE WHEN l.reason = 'compra_anulada' THEN 'compra_anulada'
              WHEN l.reason = 'compra' AND l.notes ~ '^Compra #[0-9]+$' THEN 'compra'
              ELSE 'ajuste' END,
         l.reason,
         CASE WHEN l.notes ~ '^Compra #[0-9]+' THEN substring(l.notes from '#[0-9]+') END,
         p.id,
         p.supplier_name,
         ss.employee_id,
         CASE WHEN l.notes ~ '^Compra #[0-9]+' THEN NULL ELSE l.notes END,
         NULL, false, NULL,
         7, l.id
    FROM stock_session_lines l
    JOIN stock_sessions ss ON ss.id = l.session_id
    LEFT JOIN purchases p ON p.id = CAST(substring(l.notes from '^Compra #([0-9]+)') AS int)
   WHERE l.product_id = :pid
  UNION ALL
  -- Compras recibidas antes de que la recepción escribiera su línea de sesión
  SELECT p.created_at, p.warehouse_id, pi.received_units,
         'compra', NULL, '#' || p.id, p.id, p.supplier_name,
         p.employee_id, NULL, NULL, false, p.status,
         8, pi.id
    FROM purchase_items pi
    JOIN purchases p ON p.id = pi.purchase_id
   WHERE pi.product_id = :pid AND pi.received_units > 0
     AND NOT EXISTS (
       SELECT 1 FROM stock_session_lines l
        WHERE l.product_id = :pid AND l.reason = 'compra' AND l.notes = 'Compra #' || p.id)
  UNION ALL
  -- Transferencia: sale del origen al despachar
  SELECT COALESCE(t.dispatched_at, t.created_at), t.from_warehouse_id, -i.qty_sent,
         'transferencia_salida', NULL, t.code, t.id, wt.name,
         t.employee_id, t.note, NULL, false, t.status,
         9, i.id
    FROM stock_transfer_items i
    JOIN stock_transfers t ON t.id = i.transfer_id
    LEFT JOIN warehouses wt ON wt.id = t.to_warehouse_id
   WHERE i.product_id = :pid AND t.from_warehouse_id IS NOT NULL
  UNION ALL
  -- Entra al destino lo que se confirmó al recibir
  SELECT t.received_at, t.to_warehouse_id, i.qty_received,
         'transferencia_entrada', NULL, t.code, t.id, wf.name,
         t.received_by, t.receipt_note, NULL, false, t.status,
         10, i.id
    FROM stock_transfer_items i
    JOIN stock_transfers t ON t.id = i.transfer_id
    LEFT JOIN warehouses wf ON wf.id = t.from_warehouse_id
   WHERE i.product_id = :pid AND t.received_at IS NOT NULL AND COALESCE(i.qty_received, 0) > 0
  UNION ALL
  -- Faltante resuelto como "vuelve al origen"
  SELECT i.resolved_at, t.from_warehouse_id, i.qty_sent - COALESCE(i.qty_received, 0),
         'transferencia_retorno', NULL, t.code, t.id, wt.name,
         NULL, i.diff_reason, NULL, false, t.status,
         11, i.id
    FROM stock_transfer_items i
    JOIN stock_transfers t ON t.id = i.transfer_id
    LEFT JOIN warehouses wt ON wt.id = t.to_warehouse_id
   WHERE i.product_id = :pid AND i.diff_resolution = 'return' AND i.resolved_at IS NOT NULL
     AND i.qty_sent > COALESCE(i.qty_received, 0) AND t.from_warehouse_id IS NOT NULL
  UNION ALL
  -- Transferencia anulada antes de recibirse: todo vuelve al origen
  SELECT t.cancelled_at, t.from_warehouse_id, i.qty_sent,
         'transferencia_anulada', NULL, t.code, t.id, wt.name,
         t.cancelled_by, t.cancel_reason, NULL, false, t.status,
         12, i.id
    FROM stock_transfer_items i
    JOIN stock_transfers t ON t.id = i.transfer_id
    LEFT JOIN warehouses wt ON wt.id = t.to_warehouse_id
   WHERE i.product_id = :pid AND t.status = 'cancelled' AND t.cancelled_at IS NOT NULL
     AND t.from_warehouse_id IS NOT NULL`;

const GRUPO_SQL = `CASE
    WHEN m.kind IN ('venta') THEN 'venta'
    WHEN m.kind IN ('devolucion', 'devolucion_anulada') THEN 'devolucion'
    WHEN m.kind IN ('compra', 'compra_anulada') THEN 'compra'
    WHEN m.kind = 'ajuste' THEN 'ajuste'
    ELSE 'transferencia' END`;

const num = (v) => parseFloat(v) || 0;

async function getProductMovements(req) {
  const q = req.query || {};
  const cid = req.employee?.company_id;
  const pid = parseInt(q.product_id);
  if (!pid) { const e = new Error('Indica el producto'); e.status = 400; e.isOperational = true; throw e; }

  const wid = q.warehouse_id ? parseInt(q.warehouse_id) : null;
  if (wid) await assertWarehouseAccess(req, wid);

  // El tenant del modelo confirma que el producto es de esta empresa; las filas se filtran
  // por su product_id, así que con esto basta para no cruzar empresas.
  const product = await Product.findOne({
    where: { id: pid },
    attributes: ['id', 'name', 'unit', 'image_filename', 'min_stock', 'barcode', 'is_combo', 'is_service', 'category_id'],
  });
  if (!product) { const e = new Error('Producto no encontrado'); e.status = 404; e.isOperational = true; throw e; }

  const grp = GRUPOS.includes(q.group) ? q.group : null;
  const limit = Math.min(Math.max(parseInt(q.limit) || 50, 1), 200);
  const offset = Math.max(parseInt(q.offset) || 0, 0);

  const [r] = await sequelize.query(`
    WITH scope AS (${SCOPE_SQL}),
    cur AS (
      SELECT COALESCE(SUM(ps.qty), 0) AS total
        FROM product_stock ps
       WHERE ps.product_id = :pid AND ps.warehouse_id IN (SELECT id FROM scope)
    ),
    mov AS (${MOV_SQL}),
    b AS (
      SELECT m.*, sc.name AS warehouse_name, e.full_name AS employee_name,
             (m.at AT TIME ZONE :tz)::date AS dia,
             ${GRUPO_SQL} AS grp,
             (SELECT total FROM cur) - COALESCE(SUM(CASE WHEN m.void THEN 0 ELSE m.qty END) OVER (
               ORDER BY m.at DESC, m.src DESC, m.src_id DESC
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS balance
        FROM mov m
        JOIN scope sc ON sc.id = m.warehouse_id
        LEFT JOIN employees e ON e.id = m.employee_id
    ),
    f AS (
      SELECT * FROM b
       WHERE (CAST(:df AS date) IS NULL OR dia >= CAST(:df AS date))
         AND (CAST(:dt AS date) IS NULL OR dia <= CAST(:dt AS date))
    )
    SELECT
      (SELECT total FROM cur)::float AS current,
      (SELECT COALESCE(json_agg(x), '[]'::json) FROM (
         SELECT at, warehouse_id, warehouse_name, qty::float AS qty, kind, grp, reason, doc, doc_id,
                party, employee_name, notes, via, void, doc_status, balance::float AS balance
           FROM f
          WHERE CAST(:grp AS text) IS NULL OR grp = CAST(:grp AS text)
          ORDER BY at DESC, src DESC, src_id DESC
          LIMIT :limit OFFSET :offset) x) AS rows,
      (SELECT count(*)::int FROM f WHERE CAST(:grp AS text) IS NULL OR grp = CAST(:grp AS text)) AS total,
      (SELECT COALESCE(json_agg(g), '[]'::json) FROM (
         SELECT grp, count(*)::int AS n,
                COALESCE(SUM(qty) FILTER (WHERE NOT void), 0)::float AS qty
           FROM f GROUP BY grp) g) AS groups,
      (SELECT COALESCE(SUM(qty) FILTER (WHERE qty > 0 AND NOT void), 0)::float FROM f) AS entradas,
      (SELECT COALESCE(-SUM(qty) FILTER (WHERE qty < 0 AND NOT void), 0)::float FROM f) AS salidas,
      ((SELECT total FROM cur) - COALESCE((SELECT SUM(qty) FROM b
          WHERE NOT void AND CAST(:dt AS date) IS NOT NULL AND dia > CAST(:dt AS date)), 0))::float AS closing,
      (SELECT min(at) FROM b) AS first_at,
      (SELECT COALESCE(json_agg(w ORDER BY w.name), '[]'::json) FROM (
         SELECT sc.id, sc.name, COALESCE(ps.qty, 0)::float AS qty
           FROM scope sc
           LEFT JOIN product_stock ps ON ps.warehouse_id = sc.id AND ps.product_id = :pid) w) AS warehouses
  `, {
    replacements: {
      cid, pid, wid,
      eid: esAdmin(req) ? null : (req.employee?.id ?? -1),
      tz: TZ,
      df: sanitizeDate(q.date_from) || null,
      dt: sanitizeDate(q.date_to) || null,
      grp, limit, offset,
    },
    type: Sequelize.QueryTypes.SELECT,
  });

  const entradas = num(r.entradas);
  const salidas = num(r.salidas);
  const closing = num(r.closing);

  return {
    data: {
      product: {
        id: product.id, name: product.name, unit: product.unit, barcode: product.barcode,
        min_stock: product.min_stock, is_combo: product.is_combo, is_service: product.is_service,
        image_url: imageUrl(product.image_filename),
      },
      current: num(r.current),
      warehouses: r.warehouses || [],
      rows: r.rows || [],
      total: r.total || 0,
      groups: r.groups || [],
      summary: {
        opening: parseFloat((closing - entradas + salidas).toFixed(4)),
        entradas, salidas, closing,
        first_at: r.first_at,
      },
    },
  };
}

// Buscador del kardex: productos con inventario (sin combos ni servicios) y su existencia en
// el alcance del usuario. Liviano: nombre o código exacto, 20 resultados.
async function searchMovementProducts(req) {
  const q = req.query || {};
  const cid = req.employee?.company_id;
  const wid = q.warehouse_id ? parseInt(q.warehouse_id) : null;
  if (wid) await assertWarehouseAccess(req, wid);
  const text = String(q.search || '').trim().slice(0, 80);

  const rows = await sequelize.query(`
    WITH scope AS (${SCOPE_SQL})
    SELECT p.id, p.name, p.unit, p.image_filename, p.min_stock, p.barcode,
           c.name AS category_name,
           COALESCE((SELECT SUM(ps.qty) FROM product_stock ps
                      WHERE ps.product_id = p.id AND ps.warehouse_id IN (SELECT id FROM scope)), 0)::float AS stock
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.company_id = :cid
       AND COALESCE(p.is_service, false) = false AND COALESCE(p.is_combo, false) = false
       AND (:text = '' OR p.name ILIKE :like OR p.barcode = :text)
     ORDER BY p.name
     LIMIT 20
  `, {
    replacements: {
      cid, wid,
      eid: esAdmin(req) ? null : (req.employee?.id ?? -1),
      text, like: `%${text.replace(/[\\%_]/g, (m) => '\\' + m)}%`,
    },
    type: Sequelize.QueryTypes.SELECT,
  });

  return {
    data: rows.map(({ image_filename, ...p }) => ({ ...p, image_url: imageUrl(image_filename) })),
  };
}

module.exports = { getProductMovements, searchMovementProducts };
