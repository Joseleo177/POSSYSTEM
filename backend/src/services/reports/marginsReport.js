const { sequelize, Sequelize } = require("../../models");
const { sanitizeDate, dateClause, dateClauseOn, localDate, DISPATCHED_SQL } = require("./shared");

// Rentabilidad del período, sobre una de dos bases:
//
//  - "venta" (por defecto): lo que se VENDIÓ en el período y lo que costó esa mercancía. Es la
//    utilidad devengada, la que coincide con la contabilidad y con la declaración. El ingreso es
//    el de cada factura menos sus devoluciones —el mismo "Facturado" del reporte de ventas—, así
//    que las dos pantallas dan la misma cifra para el mismo período. Antes sumaba las líneas: no
//    restaba el descuento de la factura ni las devoluciones, y dejaba fuera sin avisar las líneas
//    sin costo, con lo que "Ingresos de operación" nunca cuadraba con "Facturado".
//
//  - "cobro": la ganancia que de verdad entró a caja en el período (reporte de gestión, no
//    fiscal). Cada cobro trae la parte del costo de su factura que le corresponde: un abono del
//    50% reconoce la mitad del costo ese día, y la otra mitad llega con el resto del dinero.
//    Por eso una deuda vieja cobrada hoy suma su ganancia hoy.
//
// El modelo de la base "cobro", por factura:
//  - ref   = total − devoluciones vivas − rebaja por pagar en divisas (fx_forgiven): lo que
//            había que saldar.
//  - tope  = ref − lo exonerado de verdad: el dinero que se espera recibir.
//  - Cada movimiento salda una parte de ref y reconoce esa misma fracción del costo:
//      · cobro: lo recibido menos el vuelto que salió de otra caja (misma regla que
//        getSaleBalance). Lo que pasa del tope no es de esta venta —es el sobrante que se
//        reembolsó o quedó a favor— y no cuenta.
//      · saldo a favor aplicado (credit_applied): plata que el cliente ya había dejado; entra
//        como ingreso de esta factura el día de la venta, porque el sobrante que la originó no
//        contó en la suya.
//      · exoneración: ingreso cero y su parte del costo el día en que se perdonó. Es la
//        mercancía regalada, y es pérdida real.
//    Con la rebaja en divisas el dinero llega completo a ref − fx_forgiven y el costo completo
//    se reconoce igual: la ganancia baja en lo que se dejó de cobrar.
//
// Líneas sin costo cargado: su ingreso se separa ("sin costo") y no entra en la utilidad. Con
// costo 0 saldría como ganancia pura, y la mayoría de las veces es que nadie lo cargó. Los
// servicios sí cuentan: no tener costo es lo normal en ellos.

const r2 = (n) => Math.round((parseFloat(n) || 0) * 1e6) / 1e6;
const pct = (m, r) => (r > 0 ? Math.round((m / r) * 1000) / 10 : 0);

async function marginsReport({ date_from, date_to, limit, warehouse_id, basis, company_id, tcS, tcS2, tcP, rep, wh, allowedWarehouses, hours }) {
  const df = sanitizeDate(date_from);
  const dt = sanitizeDate(date_to);
  const porCobro = basis === "cobro";
  // Sin tope por defecto: la pantalla pagina sola y necesita TODOS los productos vendidos.
  // Antes cortaba en 30 por utilidad, así que no se veía el resto y "Menor margen" ordenaba
  // esos mismos 30 —los que más dejan—, sin mostrar nunca los que de verdad dejan poco.
  const lim = parseInt(limit) || 0;

  // Margen de una sucursal concreta. Cobra sentido ahora que el costo es por sucursal: la
  // misma mercancía puede dejar utilidades distintas en cada tienda según a cuánto la compró.
  // Sin sucursal elegida rige el recorte de siempre: lo que el usuario tiene permitido ver.
  const wid = warehouse_id ? parseInt(warehouse_id) : null;
  if (wid && Array.isArray(allowedWarehouses) && !allowedWarehouses.includes(wid)) {
    const e = new Error("No tienes acceso a este almacén"); e.status = 403; e.isOperational = true; throw e;
  }
  const whS = wid ? `AND s.warehouse_id = ${wid}` : wh('s');

  // Costo unitario a usar: primero el congelado en la venta; si no lo hay —ventas anteriores
  // a que se congelara—, el de la sucursal donde se vendió, que es la mejor reconstrucción
  // posible; luego el del catálogo; y para los combos, que no guardan costo propio, la suma
  // de sus componentes en esa misma sucursal.
  //
  // El salto por la sucursal importa: sin él, el margen de una tienda se reconstruía con lo
  // que la mercancía le costó a la otra.
  const unitCost = `COALESCE(si.cost_price, (
           SELECT ps.cost_price FROM product_stock ps
            WHERE ps.product_id = si.product_id AND ps.warehouse_id = s.warehouse_id
         ), p.cost_price, (
           SELECT SUM(COALESCE((
                    SELECT ps2.cost_price FROM product_stock ps2
                     WHERE ps2.product_id = ing.id AND ps2.warehouse_id = s.warehouse_id
                  ), ing.cost_price, 0) * pci.quantity)
             FROM product_combo_items pci
             JOIN products ing ON ing.id = pci.product_id
            WHERE pci.combo_id = p.id
         ), 0)`;

  // Ventas, sus líneas netas de devoluciones y el resumen de cada factura. `ventas` es el
  // SELECT que decide el alcance.
  //
  // Mismo criterio de venta que salesReport (DISPATCHED): la mercancía salió, se haya cobrado
  // o no. Incluye las exoneradas —el costo se incurrió igual— y lo vendido a crédito.
  const base = (ventas) => `
    v AS (${ventas}),
    l AS (
      SELECT si.sale_id, si.product_id, si.name, p.category_id,
             si.quantity - COALESCE(dv.qty, 0) AS qty,
             si.subtotal - COALESCE(dv.sub, 0) AS sub,
             (si.quantity - COALESCE(dv.qty, 0)) * u.uc AS cost,
             (u.uc > 0 OR COALESCE(p.is_service, FALSE)) AS con_costo
        FROM sale_items si
        JOIN v s ON s.id = si.sale_id
        LEFT JOIN products p ON p.id = si.product_id
        CROSS JOIN LATERAL (SELECT ${unitCost} AS uc) u
        LEFT JOIN LATERAL (
          SELECT SUM(ri.qty) AS qty, SUM(ri.subtotal) AS sub
            FROM return_items ri
            JOIN returns r ON r.id = ri.return_id
           WHERE ri.sale_item_id = si.id AND r.status <> 'anulado'
        ) dv ON TRUE
       WHERE si.quantity - COALESCE(dv.qty, 0) > 0
    ),
    vs AS (
      SELECT v.id, v.created_at, v.fx_forgiven, v.forgiven_amount, v.forgiven_at, v.credit_applied,
             GREATEST(v.total - COALESCE(dev.total, 0), 0) AS neto,
             COALESCE(x.sub, 0) AS sub,
             COALESCE(x.sin_sub, 0) AS sin_sub,
             COALESCE(x.cost, 0) AS costo
        FROM v
        LEFT JOIN (
          SELECT sale_id, SUM(sub) AS sub, SUM(sub) FILTER (WHERE NOT con_costo) AS sin_sub, SUM(cost) AS cost
            FROM l GROUP BY sale_id
        ) x ON x.sale_id = v.id
        LEFT JOIN LATERAL (
          SELECT SUM(r.total) AS total FROM returns r WHERE r.sale_id = v.id AND r.status <> 'anulado'
        ) dev ON TRUE
    )`;

  const columnas = `s.id, s.created_at, s.total, s.warehouse_id, s.fx_forgiven, s.forgiven_amount, s.forgiven_at, s.credit_applied`;

  // Lo que salda cada factura, en orden: el saldo a favor primero (se aplica al crearla), luego
  // los cobros, y la exoneración al final porque es lo que la cierra.
  const vueltoSql = `CASE WHEN p.change_journal_id IS NOT NULL THEN COALESCE(p.change_given, 0) ELSE 0 END`;
  const mov = `
    mov AS (
      SELECT p.sale_id, p.created_at, 1 AS prio, p.id AS ord, 'cobro' AS kind,
             p.amount - ${vueltoSql} AS monto, p.amount AS bruto, ${vueltoSql} AS vuelto
        FROM payments p
        JOIN v ON v.id = p.sale_id
       WHERE p.payment_journal_id IS NOT NULL AND p.amount > 0
      UNION ALL
      SELECT id, created_at, 0, 0, 'credito', credit_applied, 0, 0
        FROM v WHERE credit_applied > 0
      UNION ALL
      SELECT id, forgiven_at, 2, 0, 'perdon', forgiven_amount - fx_forgiven, 0, 0
        FROM v WHERE forgiven_at IS NOT NULL AND forgiven_amount - fx_forgiven > 0.000001
    ),
    ac AS (
      SELECT m.*,
             GREATEST(vs.neto - vs.fx_forgiven, 0) AS ref,
             GREATEST(vs.neto - vs.fx_forgiven - GREATEST(vs.forgiven_amount - vs.fx_forgiven, 0), 0) AS tope,
             SUM(CASE WHEN m.kind = 'perdon' THEN 0 ELSE m.monto END) OVER (
               PARTITION BY m.sale_id ORDER BY m.prio, m.created_at, m.ord ROWS UNBOUNDED PRECEDING
             ) AS hasta
        FROM mov m
        JOIN vs ON vs.id = m.sale_id
    )`;

  // Un evento por cosa que pasó: `ingreso` es el dinero que cuenta y `saldado / ref` la
  // fracción de la factura —y de su costo— que se reconoce. En la base "venta" cada factura
  // es un solo evento que la reconoce entera el día en que se vendió.
  const eventos = porCobro
    ? `${mov},
    ev AS (
      SELECT sale_id, created_at, kind = 'perdon' AS perdon, bruto, vuelto, ref,
             CASE WHEN kind = 'perdon' THEN 0
                  ELSE GREATEST(LEAST(hasta, tope) - LEAST(hasta - monto, tope), 0) END AS ingreso,
             CASE WHEN kind = 'perdon' THEN LEAST(monto, ref)
                  ELSE GREATEST(LEAST(hasta, tope) - LEAST(hasta - monto, tope), 0) END AS saldado
        FROM ac
    )`
    : `
    ev AS (
      SELECT id AS sale_id, created_at, FALSE AS perdon, 0::numeric AS bruto, 0::numeric AS vuelto,
             neto AS ref, neto AS ingreso, neto AS saldado
        FROM vs
    )`;

  // Alcance. Por venta: lo vendido en el período. Por cobro: toda factura que tuvo un cobro,
  // un saldo a favor aplicado o una exoneración en el período, sea de cuando sea —sus eventos
  // fuera del período se calculan igual, porque el tope se va llenando en orden—.
  const ventas = porCobro
    ? `SELECT ${columnas} FROM sales s
        WHERE s.status IN (${DISPATCHED_SQL}) ${tcS} ${whS}
          AND s.id IN (
            SELECT p.sale_id FROM payments p
             WHERE p.payment_journal_id IS NOT NULL AND p.amount > 0 ${tcP} ${dateClause(df, dt, 'p', hours)}
            UNION
            SELECT s2.id FROM sales s2
             WHERE s2.credit_applied > 0 ${tcS2} ${dateClause(df, dt, 's2', hours)}
            UNION
            SELECT s2.id FROM sales s2
             WHERE s2.forgiven_at IS NOT NULL ${tcS2} ${dateClauseOn(df, dt, 's2.forgiven_at', hours)}
          )`
    : `SELECT ${columnas} FROM sales s
        WHERE s.status IN (${DISPATCHED_SQL}) ${tcS} ${whS} ${dateClause(df, dt, 's', hours)}`;

  const ctes = `WITH ${base(ventas)},${eventos},
    evr AS (SELECT * FROM ev e WHERE TRUE ${dateClause(df, dt, 'e', hours)})`;

  // Mismo día que el filtro: con franja nocturna es la jornada, no la fecha del calendario.
  const dia = localDate('e.created_at', hours);
  const q = (sql) => sequelize.query(sql, { replacements: rep, type: Sequelize.QueryTypes.SELECT });

  const [dias, lineas, pendiente] = await Promise.all([
    // Por día, y la fila de totales (day NULL) con las ventas distintas del período.
    q(`${ctes}
       SELECT ${dia} AS day,
              COUNT(DISTINCT e.sale_id)::int AS sales,
              COALESCE(SUM(e.ingreso), 0)::float AS revenue,
              COALESCE(SUM(e.ingreso * vs.sin_sub / NULLIF(vs.sub, 0)), 0)::float AS sin_costo,
              COALESCE(SUM(e.saldado / NULLIF(e.ref, 0) * vs.costo), 0)::float AS cost,
              COALESCE(SUM(e.saldado / NULLIF(e.ref, 0) * vs.costo) FILTER (WHERE e.perdon), 0)::float AS forgiven_cost,
              COALESCE(SUM(e.bruto), 0)::float AS cobrado,
              COALESCE(SUM(e.vuelto), 0)::float AS vuelto
         FROM evr e
         JOIN vs ON vs.id = e.sale_id
        GROUP BY GROUPING SETS ((${dia}), ())
        ORDER BY 1 ASC NULLS LAST`),
    // Por producto. Cada línea recibe la parte del ingreso de su factura según su peso —así el
    // descuento de la factura se reparte y la suma de los productos da el total— y la fracción
    // del costo que se reconoció en el período.
    q(`${ctes},
       pv AS (
         SELECT sale_id, SUM(ingreso) AS ingreso, SUM(saldado / NULLIF(ref, 0)) AS frac
           FROM evr GROUP BY sale_id
       )
       SELECT l.product_id, l.name AS product_name, COALESCE(c.name, 'Sin categoría') AS category_name, l.con_costo,
              COUNT(DISTINCT l.sale_id)::int AS sales_count,
              COALESCE(SUM(l.qty * pv.frac), 0)::float AS total_qty,
              COALESCE(SUM(pv.ingreso * l.sub / NULLIF(vs.sub, 0)), 0)::float AS revenue,
              COALESCE(SUM(l.cost * pv.frac), 0)::float AS total_cost
         FROM l
         JOIN pv ON pv.sale_id = l.sale_id
         JOIN vs ON vs.id = l.sale_id
         LEFT JOIN categories c ON c.id = l.category_id
        GROUP BY l.product_id, l.name, c.name, l.con_costo`),
    // Ganancia que sigue en la calle: lo que falta cobrar de las facturas abiertas, con su
    // parte de utilidad. No depende del período: es la foto de hoy.
    porCobro
      ? q(`WITH ${base(`SELECT ${columnas} FROM sales s WHERE s.status IN ('pendiente', 'parcial') ${tcS} ${whS}`)},${mov}
           SELECT COUNT(*)::int AS count,
                  COALESCE(SUM(pend), 0)::float AS amount,
                  COALESCE(SUM(pend - pend * sin_sub / NULLIF(sub, 0) - pend / NULLIF(ref, 0) * costo), 0)::float AS profit
             FROM (
               SELECT vs.sub, vs.sin_sub, vs.costo,
                      GREATEST(vs.neto - vs.fx_forgiven, 0) AS ref,
                      GREATEST(
                        GREATEST(vs.neto - vs.fx_forgiven - GREATEST(vs.forgiven_amount - vs.fx_forgiven, 0), 0)
                        - COALESCE((SELECT SUM(m.monto) FROM mov m WHERE m.sale_id = vs.id AND m.kind <> 'perdon'), 0),
                      0) AS pend
                 FROM vs
             ) x
            WHERE pend > 0.005`)
      : Promise.resolve(null),
  ]);

  const total = dias.find(d => d.day === null) || {};
  const byDay = dias.filter(d => d.day !== null).map(d => {
    const profit = d.revenue - d.sin_costo - d.cost;
    return {
      day: d.day,
      revenue: r2(d.revenue),
      sin_costo: r2(d.sin_costo),
      cost: r2(d.cost),
      profit: r2(profit),
      margin_pct: pct(profit, d.revenue - d.sin_costo),
    };
  });

  const conMargen = (r) => {
    const gross = r.revenue - r.total_cost;
    return { ...r, revenue: r2(r.revenue), total_cost: r2(r.total_cost), total_qty: r2(r.total_qty), gross_margin: r2(gross), margin_pct: pct(gross, r.revenue) };
  };
  const byProductAll = lineas.filter(r => r.con_costo).map(conMargen).sort((a, b) => b.gross_margin - a.gross_margin);
  const byProduct = lim > 0 ? byProductAll.slice(0, lim) : byProductAll;

  const cats = new Map();
  for (const r of lineas.filter(r => r.con_costo)) {
    const c = cats.get(r.category_name) || { category_name: r.category_name, productos: new Set(), revenue: 0, total_cost: 0 };
    c.productos.add(r.product_id ?? r.product_name);
    c.revenue += r.revenue;
    c.total_cost += r.total_cost;
    cats.set(r.category_name, c);
  }
  const byCategory = [...cats.values()]
    .map(({ productos, ...c }) => conMargen({ ...c, product_count: productos.size, total_qty: 0 }))
    .sort((a, b) => b.gross_margin - a.gross_margin);

  const sinCosto = lineas.filter(r => !r.con_costo)
    .map(r => ({ product_id: r.product_id, product_name: r.product_name, category_name: r.category_name, sales_count: r.sales_count, total_qty: r2(r.total_qty), revenue: r2(r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  const revenue = parseFloat(total.revenue || 0);
  const sinCostoTotal = parseFloat(total.sin_costo || 0);
  const cost = parseFloat(total.cost || 0);
  const margin = revenue - sinCostoTotal - cost;
  const cobrado = parseFloat(total.cobrado || 0);
  const vuelto = parseFloat(total.vuelto || 0);

  return {
    basis: porCobro ? "cobro" : "venta",
    summary: {
      total_revenue: r2(revenue),
      sin_costo: r2(sinCostoTotal),
      sin_costo_count: sinCosto.length,
      total_cost: r2(cost),
      forgiven_cost: r2(total.forgiven_cost),
      total_margin: r2(margin),
      avg_margin_pct: pct(margin, revenue - sinCostoTotal),
      products_with_cost: byProductAll.length,
      sales_count: parseInt(total.sales || 0),
      // Solo en la base "cobro": cómo se llega de lo cobrado (la cifra de "Cobros por diario")
      // al ingreso que cuenta. `ajustes` es el saldo a favor aplicado menos lo que pasó del
      // tope de cada factura.
      cobrado: r2(cobrado),
      vuelto: r2(vuelto),
      ajustes: porCobro ? r2(revenue - (cobrado - vuelto)) : 0,
      pending: pendiente ? {
        count: parseInt(pendiente[0]?.count || 0),
        amount: r2(pendiente[0]?.amount),
        profit: r2(pendiente[0]?.profit),
      } : null,
    },
    by_product:    byProduct,
    bottom_margin: [...byProductAll].sort((a, b) => a.margin_pct - b.margin_pct).slice(0, 10),
    by_category:   byCategory,
    sin_costo:     sinCosto,
    by_day:        byDay,
  };
}

module.exports = marginsReport;
