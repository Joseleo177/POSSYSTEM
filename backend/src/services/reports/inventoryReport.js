const { sequelize, Sequelize } = require("../../models");

async function inventoryReport({ days = 30, warehouse_id, category_id, limit = 50, offset = 0, view = "all", search = "", company_id, tcP, tcS, rep, wh, allowedWarehouses }) {
  const lim = parseInt(limit);
  const off = parseInt(offset);
  const d   = parseInt(days);
  const wid = warehouse_id ? parseInt(warehouse_id) : null;
  const cid = category_id  ? parseInt(category_id)  : null;

  // Pedir un almacén ajeno por query no puede saltarse el recorte.
  if (wid && Array.isArray(allowedWarehouses) && !allowedWarehouses.includes(wid)) {
    const e = new Error("No tienes acceso a este almacén"); e.status = 403; e.isOperational = true; throw e;
  }

  // Sin almacén elegido se suma el stock de la empresa; para quien no es admin, solo el de
  // sus sucursales.
  const stockField = wid
    ? `COALESCE(ps.qty, 0)`
    : `(SELECT COALESCE(SUM(qty), 0) FROM product_stock WHERE product_id = p.id AND company_id = p.company_id ${wh()})`;

  // El catálogo es de la empresa, pero el reporte no lo es: sin esto, a quien tiene una sola
  // sucursal le aparecían en "quiebre de stock" todos los productos que nunca se cargaron
  // ahí. No es que se le acabaron —nunca los tuvo—, y el listado se volvía ruido.
  // Con un almacén elegido no hace falta: stockJoin ya es un JOIN interno contra ese almacén.
  const allowedIds = Array.isArray(allowedWarehouses) ? allowedWarehouses.filter(Number.isInteger) : null;
  if (!wid && allowedIds) {
    const presence = allowedIds.length
      ? `AND EXISTS (SELECT 1 FROM product_stock ps2 WHERE ps2.product_id = p.id AND ps2.warehouse_id IN (${allowedIds.join(',')}))`
      : `AND FALSE`;
    tcP = `${tcP} ${presence}`;
  }
  const stockJoin  = wid ? `JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = ${wid}` : '';
  const catFilter  = cid ? `AND p.category_id = ${cid}` : '';
  const searchFilter = search ? `AND p.name ILIKE '%${search.replace(/'/g, "''")}%'` : '';
  // Mismo criterio de "venta realizada" que el resto de los reportes. Sin él, un producto
  // cuyas únicas salidas fueron anuladas contaba como rotando y desaparecía del listado de
  // lento movimiento, que es justo donde hace falta verlo.
  const stS = `AND s.status = 'pagado'`;
  const slowSubquery = `SELECT DISTINCT si.product_id FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s.created_at >= NOW() - (${d} * INTERVAL '1 day') ${tcS} ${wh('s')} ${stS}`;

  const [criticalCount, zeroCount, slowCount, lockedValue] = await Promise.all([
    sequelize.query(`SELECT COUNT(*)::int AS count FROM products p ${stockJoin} WHERE p.is_service = false AND p.is_combo = false AND p.min_stock > 0 AND ${stockField} < p.min_stock ${tcP} ${catFilter} ${searchFilter}`, { replacements: rep, type: Sequelize.QueryTypes.SELECT }),
    sequelize.query(`SELECT COUNT(*)::int AS count FROM products p ${stockJoin} WHERE p.is_service = false AND p.is_combo = false AND (${stockField} IS NULL OR ${stockField} <= 0) ${tcP} ${catFilter} ${searchFilter}`, { replacements: rep, type: Sequelize.QueryTypes.SELECT }),
    sequelize.query(`SELECT COUNT(p.id)::int AS count FROM products p ${stockJoin} WHERE p.is_service = false AND p.is_combo = false AND ${stockField} > 0 AND p.id NOT IN (${slowSubquery}) ${tcP} ${catFilter} ${searchFilter}`, { replacements: rep, type: Sequelize.QueryTypes.SELECT }),
    sequelize.query(`SELECT COALESCE(SUM(${stockField} * COALESCE(p.cost_price, p.price)), 0)::float AS value FROM products p ${stockJoin} WHERE p.is_service = false AND p.is_combo = false AND ${stockField} > 0 AND p.id NOT IN (${slowSubquery}) ${tcP} ${catFilter} ${searchFilter}`, { replacements: rep, type: Sequelize.QueryTypes.SELECT }),
  ]);

  const listData = {};

  if (view === "all" || view === "critical") {
    listData.critical_stock = await sequelize.query(
      `SELECT p.id, p.name, ${stockField} AS stock, p.min_stock, p.unit, p.price,
              COALESCE(c.name,'Sin categoría') AS category_name, (p.min_stock - ${stockField}) AS needed
       FROM products p LEFT JOIN categories c ON p.category_id = c.id ${stockJoin}
       WHERE p.is_service = false AND p.is_combo = false AND p.min_stock > 0 AND ${stockField} < p.min_stock ${tcP} ${catFilter} ${searchFilter}
       ORDER BY (p.min_stock - ${stockField}) DESC LIMIT ${lim} OFFSET ${off}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    );
  }
  if (view === "all" || view === "zero") {
    listData.zero_stock = await sequelize.query(
      `SELECT p.id, p.name, ${stockField} AS stock, p.min_stock, p.unit,
              COALESCE(c.name,'Sin categoría') AS category_name
       FROM products p LEFT JOIN categories c ON p.category_id = c.id ${stockJoin}
       WHERE p.is_service = false AND p.is_combo = false AND (${stockField} IS NULL OR ${stockField} <= 0) ${tcP} ${catFilter} ${searchFilter}
       ORDER BY p.name ASC LIMIT ${lim} OFFSET ${off}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    );
  }
  if (view === "all" || view === "top") {
    listData.top_rotation = await sequelize.query(
      `SELECT p.id, p.name, ${stockField} AS stock, p.unit,
              COALESCE(SUM(si.quantity), 0)::float AS units_sold,
              COALESCE(SUM(si.subtotal), 0)::float AS revenue
       FROM products p ${stockJoin}
       JOIN sale_items si ON si.product_id = p.id
       JOIN sales s ON si.sale_id = s.id
       WHERE s.created_at >= NOW() - (${d} * INTERVAL '1 day') ${stS}
         AND p.is_service = false AND p.is_combo = false ${tcS} ${wh('s')} ${tcP} ${catFilter} ${searchFilter}
       GROUP BY p.id, p.name, ${stockField}, p.unit
       ORDER BY units_sold DESC LIMIT ${lim} OFFSET ${off}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    );
  }
  if (view === "all" || view === "slow") {
    listData.low_rotation = await sequelize.query(
      `SELECT p.id, p.name, ${stockField} AS stock, p.price,
              COALESCE(p.cost_price, 0) AS cost_price,
              COALESCE(c.name,'Sin categoría') AS category_name,
              ${stockField} * COALESCE(p.cost_price, p.price) AS value_locked
       FROM products p LEFT JOIN categories c ON p.category_id = c.id ${stockJoin}
       WHERE p.is_service = false AND p.is_combo = false AND ${stockField} > 0
         AND p.id NOT IN (${slowSubquery}) ${tcP} ${catFilter} ${searchFilter}
       ORDER BY value_locked DESC LIMIT ${lim} OFFSET ${off}`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    );
  }
  if (view === "all" || view === "category") {
    listData.by_category = await sequelize.query(
      `SELECT COALESCE(c.name,'Sin categoría') AS category_name,
              COUNT(p.id)::int AS product_count,
              COALESCE(SUM(${stockField}), 0)::float AS total_units,
              COALESCE(SUM(${stockField} * COALESCE(p.cost_price, 0)), 0)::float AS value_cost,
              COALESCE(SUM(${stockField} * p.price), 0)::float AS value_sale
       FROM products p LEFT JOIN categories c ON p.category_id = c.id ${stockJoin}
       WHERE p.is_service = false AND p.is_combo = false ${tcP} ${catFilter} ${searchFilter}
       GROUP BY c.name ORDER BY value_cost DESC`,
      { replacements: rep, type: Sequelize.QueryTypes.SELECT }
    );
  }

  const total = view === 'critical' ? parseInt(criticalCount[0]?.count || 0)
    : view === 'zero'     ? parseInt(zeroCount[0]?.count  || 0)
    : view === 'slow'     ? parseInt(slowCount[0]?.count  || 0)
    : view === 'top'      ? 50
    : 0;

  return {
    ...listData,
    summary: {
      critical_count:     parseInt(criticalCount[0]?.count  || 0),
      zero_count:         parseInt(zeroCount[0]?.count      || 0),
      low_rotation_count: parseInt(slowCount[0]?.count      || 0),
      total_locked_value: parseFloat(lockedValue[0]?.value  || 0),
    },
    total,
  };
}

module.exports = inventoryReport;
