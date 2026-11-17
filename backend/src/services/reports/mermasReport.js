const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClauseOn } = require("./shared");

// Reporte de mermas: lo que el inventario perdió en el período, por qué y cuánto costó.
//
// Salen de dos lados:
//  - Las líneas de ajuste (Inventario → Mov. manual, y Stock): las salidas marcadas como merma,
//    vencido, robo o consumo interno; los faltantes de un conteo físico; y el ajuste directo que
//    bajó la existencia sin decir por qué.
//  - Las transferencias: lo que salió del origen, no llegó al destino y se dio por perdido.
// El consumo interno va aparte: no es una pérdida, es mercancía que se usó en el local.
//
// El costo es el que tenía el producto en esa sucursal el día del ajuste (stock_session_lines
// .unit_cost, desde el 17-11-2026; en una transferencia, el costo con que salió). Lo de antes
// no lo guardaba: se valora al costo de hoy y se marca como estimado.

const GRUPOS = ["merma", "vencimiento", "robo", "conteo", "ajuste", "transferencia", "consumo"];
const PERDIDAS = GRUPOS.filter(g => g !== "consumo");
const MAX_FILAS = 3000;

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const r3 = (n) => Math.round((parseFloat(n) || 0) * 1000) / 1000;

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

async function mermasReport({ company_id, allowedWarehouses, date_from, date_to, warehouse_id }) {
  if (!company_id) throw fail("Elige una empresa");
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const wid = parseInt(warehouse_id, 10) || null;
  if (wid && Array.isArray(allowedWarehouses) && !allowedWarehouses.includes(wid)) {
    throw fail("No tienes acceso a esa sucursal", 403);
  }
  // Ids validados como enteros antes de intercalarse, como el resto de los reportes.
  const ids = wid ? [wid] : (Array.isArray(allowedWarehouses) ? allowedWarehouses.filter(Number.isInteger) : null);
  const enSucursal = (col) => (ids === null ? "" : ids.length ? `AND ${col} IN (${ids.join(",")})` : "AND FALSE");

  const filas = await sequelize.query(`
    WITH perdidas AS (
      SELECT 'aj-' || l.id AS id, l.created_at AS at,
             CASE l.reason WHEN 'ajuste_directo' THEN 'ajuste' ELSE l.reason END AS grupo,
             l.warehouse_id, l.product_id, l.product_name, -l.qty_adjusted AS qty, l.unit_cost,
             ss.employee_id, l.notes, ss.id AS doc_id, NULL::text AS doc
        FROM stock_session_lines l
        JOIN stock_sessions ss ON ss.id = l.session_id
       WHERE ss.company_id = :cid
         AND l.qty_adjusted < 0
         AND l.reason IN ('merma', 'vencimiento', 'robo', 'consumo', 'conteo', 'ajuste_directo')
         ${enSucursal("l.warehouse_id")}
         ${dateClauseOn(df, dt, "l.created_at")}
      UNION ALL
      SELECT 'tr-' || i.id, i.resolved_at, 'transferencia',
             t.from_warehouse_id, i.product_id, i.product_name,
             i.qty_sent - COALESCE(i.qty_received, 0), i.unit_cost,
             t.received_by, i.diff_reason, t.id, t.code
        FROM stock_transfer_items i
        JOIN stock_transfers t ON t.id = i.transfer_id
       WHERE t.company_id = :cid
         AND i.diff_resolution = 'loss' AND i.resolved_at IS NOT NULL
         AND i.qty_sent - COALESCE(i.qty_received, 0) > 0
         ${enSucursal("t.from_warehouse_id")}
         ${dateClauseOn(df, dt, "i.resolved_at")}
    )
    SELECT p.id, p.at, p.grupo, p.warehouse_id, w.name AS warehouse_name,
           p.product_id, COALESCE(pr.name, p.product_name) AS product_name, pr.unit,
           c.name AS category_name, p.qty::float AS qty,
           COALESCE(p.unit_cost, ps.cost_price, pr.cost_price, 0)::float AS unit_cost,
           (p.unit_cost IS NULL) AS estimated,
           e.full_name AS employee_name, p.notes, p.doc_id, p.doc
      FROM perdidas p
      LEFT JOIN warehouses w     ON w.id = p.warehouse_id
      LEFT JOIN products pr      ON pr.id = p.product_id
      LEFT JOIN categories c     ON c.id = pr.category_id
      LEFT JOIN product_stock ps ON ps.product_id = p.product_id AND ps.warehouse_id = p.warehouse_id
      LEFT JOIN employees e      ON e.id = p.employee_id
     ORDER BY p.at DESC, p.id`,
    { replacements: { cid: company_id }, type: Sequelize.QueryTypes.SELECT });

  const rows = filas.map(f => ({
    ...f,
    qty: r3(f.qty),
    unit_cost: parseFloat(f.unit_cost) || 0,
    value: r2((parseFloat(f.qty) || 0) * (parseFloat(f.unit_cost) || 0)),
  }));

  // Por motivo.
  const groups = GRUPOS.map(g => {
    const de = rows.filter(r => r.grupo === g);
    return {
      key: g,
      count: de.length,
      value: r2(de.reduce((a, r) => a + r.value, 0)),
      estimated_value: r2(de.filter(r => r.estimated).reduce((a, r) => a + r.value, 0)),
    };
  });

  // Por producto: cuánto se perdió de cada uno y por qué (el consumo interno, aparte).
  const porProducto = new Map();
  for (const r of rows) {
    const k = r.product_id || r.product_name;
    if (!porProducto.has(k)) {
      porProducto.set(k, {
        product_id: r.product_id, product_name: r.product_name, unit: r.unit, category_name: r.category_name,
        qty: 0, value: 0, consumo_qty: 0, consumo_value: 0, count: 0, estimated: false, by_group: {},
      });
    }
    const p = porProducto.get(k);
    if (r.grupo === "consumo") {
      p.consumo_qty += r.qty;
      p.consumo_value += r.value;
    } else {
      p.qty += r.qty;
      p.value += r.value;
      p.count += 1;
      p.by_group[r.grupo] = r3((p.by_group[r.grupo] || 0) + r.qty);
    }
    if (r.estimated) p.estimated = true;
  }
  const by_product = [...porProducto.values()]
    .map(p => ({ ...p, qty: r3(p.qty), value: r2(p.value), consumo_qty: r3(p.consumo_qty), consumo_value: r2(p.consumo_value) }))
    .sort((a, b) => b.value - a.value || b.consumo_value - a.consumo_value);

  // Por sucursal.
  const porSucursal = new Map();
  for (const r of rows) {
    if (r.grupo === "consumo") continue;
    const s = porSucursal.get(r.warehouse_id) || { warehouse_id: r.warehouse_id, warehouse_name: r.warehouse_name, count: 0, value: 0 };
    s.count += 1;
    s.value += r.value;
    porSucursal.set(r.warehouse_id, s);
  }
  const by_warehouse = [...porSucursal.values()].map(s => ({ ...s, value: r2(s.value) })).sort((a, b) => b.value - a.value);

  const perdidas = rows.filter(r => PERDIDAS.includes(r.grupo));
  const consumo = rows.filter(r => r.grupo === "consumo");
  return {
    summary: {
      loss_value: r2(perdidas.reduce((a, r) => a + r.value, 0)),
      loss_count: perdidas.length,
      loss_products: new Set(perdidas.map(r => r.product_id || r.product_name)).size,
      estimated_value: r2(perdidas.filter(r => r.estimated).reduce((a, r) => a + r.value, 0)),
      consumo_value: r2(consumo.reduce((a, r) => a + r.value, 0)),
      consumo_count: consumo.length,
    },
    groups,
    by_product,
    by_warehouse,
    rows: rows.slice(0, MAX_FILAS),
    truncated: rows.length > MAX_FILAS,
    total_rows: rows.length,
  };
}

module.exports = mermasReport;
