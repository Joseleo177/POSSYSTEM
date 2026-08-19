const { Sale, SaleItem, Purchase, Sequelize, sequelize } = require("../../models");
const { localDate, TZ } = require("../reports/shared");
const { Op } = Sequelize;

// "Hoy" y "últimos 30 días" se resuelven en la zona de operación, no en la del proceso
// Node: con el servidor en UTC el día arrancaba a las 8 PM hora local del día anterior y
// el KPI del dashboard no cuadraba con la lista de ventas. Se comparan fechas locales
// contra fechas locales para que el corte sea el mismo que ve el cajero.
const TODAY  = `(NOW() AT TIME ZONE '${TZ}')::date`;
const MONTH  = `((NOW() AT TIME ZONE '${TZ}')::date - 30)`;
const sinceToday = (col) => `${localDate(col)} = ${TODAY}`;
const sinceMonth = (col) => `${localDate(col)} >= ${MONTH}`;

async function getDashboard({ company_id, isSuperuser }) {

  const tenantWhere  = company_id ? { company_id } : {};
  const tenantClause = company_id ? `AND company_id = :company_id` : "";

  const [kpiToday, kpiMonth] = await Promise.all([
    Sale.findOne({
      where: { ...tenantWhere, [Op.and]: Sequelize.literal(sinceToday('"Sale"."created_at"')), status: { [Op.notIn]: ["anulado", "devuelto", "eliminado"] } },
      attributes: [
        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
        [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("total")), 0), "revenue"],
      ],
      raw: true,
    }),
    Sale.findOne({
      where: { ...tenantWhere, [Op.and]: Sequelize.literal(sinceMonth('"Sale"."created_at"')), status: { [Op.notIn]: ["anulado", "devuelto", "eliminado"] } },
      attributes: [
        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
        [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("total")), 0), "revenue"],
      ],
      raw: true,
    }),
  ]);

  const [incomeToday, incomeMonth, expenseToday, expenseMonth] = await Promise.all([
    sequelize.query(`SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p LEFT JOIN sales s ON s.id = p.sale_id WHERE ${sinceToday('p.created_at')} AND (s.id IS NULL OR s.status != 'anulado') ${!!company_id ? "AND p.company_id = :company_id" : ""}`,   { replacements: { company_id }, type: Sequelize.QueryTypes.SELECT }),
    sequelize.query(`SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p LEFT JOIN sales s ON s.id = p.sale_id WHERE ${sinceMonth('p.created_at')} AND (s.id IS NULL OR s.status != 'anulado') ${!!company_id ? "AND p.company_id = :company_id" : ""}`,   { replacements: { company_id }, type: Sequelize.QueryTypes.SELECT }),
    sequelize.query(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE ${sinceToday('created_at')} AND status = 'activo' ${tenantClause}`, { replacements: { company_id }, type: Sequelize.QueryTypes.SELECT }),
    sequelize.query(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE ${sinceMonth('created_at')} AND status = 'activo' ${tenantClause}`, { replacements: { company_id }, type: Sequelize.QueryTypes.SELECT }),
  ]);

  const cashInHand = await sequelize.query(`
    SELECT (
      (SELECT COALESCE(SUM(p.amount), 0) FROM payments p LEFT JOIN sales s ON s.id = p.sale_id WHERE (s.id IS NULL OR s.status != 'anulado') AND (p.reference_number IS NULL OR p.reference_number NOT LIKE 'ANUL-%') ${!!company_id ? "AND p.company_id = :company_id" : ""})
      -
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE status = 'activo' ${!!company_id ? "AND company_id = :company_id" : ""})
    ) as total
  `, { replacements: { company_id }, type: Sequelize.QueryTypes.SELECT });

  const topProducts = await SaleItem.findAll({
    attributes: [
      "product_id", "name",
      [Sequelize.fn("SUM", Sequelize.col("quantity")), "total_qty"],
      [Sequelize.fn("SUM", Sequelize.col("subtotal")),  "total_revenue"],
    ],
    include: [{
      model: Sale, attributes: [],
      where: { ...tenantWhere, [Op.and]: Sequelize.literal(sinceMonth('"Sale"."created_at"')), status: { [Op.notIn]: ["anulado", "eliminado", "devuelto"] } },
      required: true,
    }],
    group: ["SaleItem.product_id", "SaleItem.name"],
    order: [[Sequelize.literal("total_qty"), "DESC"]],
    // 15 en vez de 5: el tablero muestra la lista en una caja de alto fijo con scroll, así
    // que caben sin empujar el resto del layout y el top deja de cortarse en el quinto.
    limit: 15, raw: true,
  });

  const salesByDay = await sequelize.query(`
    SELECT ${localDate('created_at')} AS day,
           COUNT(*)::int AS count,
           COALESCE(SUM(total), 0)::float AS revenue
    FROM sales
    WHERE ${sinceMonth('created_at')}
      AND status NOT IN ('anulado', 'eliminado', 'devuelto')
      ${!!company_id ? "AND company_id = :company_id" : ""}
    GROUP BY ${localDate('created_at')}
    ORDER BY day ASC
  `, { replacements: { company_id }, type: Sequelize.QueryTypes.SELECT });

  const pendingResults = await sequelize.query(`
    SELECT COUNT(id) as count,
           COALESCE(SUM(total - (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.sale_id = s.id)), 0) as balance
    FROM sales s
    WHERE s.status IN ('borrador', 'pendiente', 'parcial')
    ${!!company_id ? "AND s.company_id = :company_id" : ""}
  `, { replacements: { company_id }, type: Sequelize.QueryTypes.SELECT });

  const lowStock = await sequelize.query(`
    SELECT p.id, p.name, p.unit, p.min_stock, COALESCE(SUM(ps.qty), 0) as total_stock
    FROM products p
    LEFT JOIN product_stock ps ON ps.product_id = p.id
    WHERE p.min_stock > 0
    ${!!company_id ? "AND p.company_id = :company_id" : ""}
    GROUP BY p.id, p.name, p.unit, p.min_stock
    HAVING COALESCE(SUM(ps.qty), 0) < p.min_stock
    ORDER BY total_stock ASC
    LIMIT 20
  `, { replacements: { company_id }, type: Sequelize.QueryTypes.SELECT });

  const purchasesMonth = await Purchase.findOne({
    where: { ...tenantWhere, [Op.and]: Sequelize.literal(sinceMonth('"Purchase"."created_at"')) },
    attributes: [
      [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
      [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("total")), 0), "total"],
    ],
    raw: true,
  });

  return {
    data: {
      kpi: {
        today: {
          sales:    parseInt(kpiToday?.count   || 0),
          revenue:  parseFloat(kpiToday?.revenue || 0),
          income:   parseFloat(incomeToday[0]?.total  || 0),
          expenses: parseFloat(expenseToday[0]?.total || 0),
        },
        month: {
          sales:    parseInt(kpiMonth?.count   || 0),
          revenue:  parseFloat(kpiMonth?.revenue || 0),
          income:   parseFloat(incomeMonth[0]?.total  || 0),
          expenses: parseFloat(expenseMonth[0]?.total || 0),
        },
        cash_in_hand: parseFloat(cashInHand[0]?.total || 0),
      },
      top_products: topProducts.map(p => ({
        product_id:    p.product_id,
        name:          p.name,
        total_qty:     parseFloat(p.total_qty    || 0),
        total_revenue: parseFloat(p.total_revenue || 0),
      })),
      sales_by_day:    salesByDay,
      pending_bills: {
        count:   parseInt(pendingResults[0]?.count   || 0),
        balance: parseFloat(pendingResults[0]?.balance || 0),
      },
      low_stock:       lowStock,
      purchases_month: {
        count: parseInt(purchasesMonth?.count || 0),
        total: parseFloat(purchasesMonth?.total || 0),
      },
    },
  };
}

module.exports = { getDashboard };
