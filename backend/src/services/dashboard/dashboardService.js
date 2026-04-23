const { Sale, SaleItem, Purchase, Sequelize, sequelize } = require("../../models");
const { Op } = Sequelize;

async function getDashboard({ company_id, isSuperuser }) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const month = new Date(today); month.setDate(month.getDate() - 30);

  const tenantWhere  = (!isSuperuser && company_id) ? { company_id } : {};
  const tenantClause = (!isSuperuser && company_id) ? `AND company_id = :company_id` : "";

  const [kpiToday, kpiMonth] = await Promise.all([
    Sale.findOne({
      where: { ...tenantWhere, created_at: { [Op.gte]: today }, status: { [Op.ne]: "anulado" } },
      attributes: [
        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
        [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("total")), 0), "revenue"],
      ],
      raw: true,
    }),
    Sale.findOne({
      where: { ...tenantWhere, created_at: { [Op.gte]: month }, status: { [Op.ne]: "anulado" } },
      attributes: [
        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
        [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("total")), 0), "revenue"],
      ],
      raw: true,
    }),
  ]);

  const [incomeToday, incomeMonth, expenseToday, expenseMonth] = await Promise.all([
    sequelize.query(`SELECT COALESCE(SUM(amount * COALESCE(exchange_rate, 1)), 0) as total FROM payments WHERE created_at >= :today ${tenantClause}`,   { replacements: { today, company_id }, type: Sequelize.QueryTypes.SELECT }),
    sequelize.query(`SELECT COALESCE(SUM(amount * COALESCE(exchange_rate, 1)), 0) as total FROM payments WHERE created_at >= :month ${tenantClause}`,   { replacements: { month, company_id }, type: Sequelize.QueryTypes.SELECT }),
    sequelize.query(`SELECT COALESCE(SUM(amount * COALESCE(rate, 1)), 0) as total FROM expenses WHERE created_at >= :today AND status = 'activo' ${tenantClause}`, { replacements: { today, company_id }, type: Sequelize.QueryTypes.SELECT }),
    sequelize.query(`SELECT COALESCE(SUM(amount * COALESCE(rate, 1)), 0) as total FROM expenses WHERE created_at >= :month AND status = 'activo' ${tenantClause}`, { replacements: { month, company_id }, type: Sequelize.QueryTypes.SELECT }),
  ]);

  const cashInHand = await sequelize.query(`
    SELECT (
      (SELECT COALESCE(SUM(amount * COALESCE(exchange_rate, 1)), 0) FROM payments ${!isSuperuser && company_id ? "WHERE company_id = :company_id" : ""})
      -
      (SELECT COALESCE(SUM(amount * COALESCE(rate, 1)), 0) FROM expenses WHERE status = 'activo' ${!isSuperuser && company_id ? "AND company_id = :company_id" : ""})
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
      where: { ...tenantWhere, created_at: { [Op.gte]: month }, status: { [Op.notIn]: ["anulado", "eliminado"] } },
      required: true,
    }],
    group: ["SaleItem.product_id", "SaleItem.name"],
    order: [[Sequelize.literal("total_qty"), "DESC"]],
    limit: 5, raw: true,
  });

  const salesByDay = await sequelize.query(`
    SELECT CAST(created_at AS DATE) AS day,
           COUNT(*)::int AS count,
           COALESCE(SUM(total), 0)::float AS revenue
    FROM sales
    WHERE created_at >= NOW() - INTERVAL '30 days'
      AND status NOT IN ('anulado', 'eliminado')
      ${!isSuperuser && company_id ? "AND company_id = :company_id" : ""}
    GROUP BY CAST(created_at AS DATE)
    ORDER BY day ASC
  `, { replacements: { company_id }, type: Sequelize.QueryTypes.SELECT });

  const pendingResults = await sequelize.query(`
    SELECT COUNT(id) as count,
           COALESCE(SUM(total - (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.sale_id = s.id)), 0) as balance
    FROM sales s
    WHERE s.status IN ('pendiente', 'parcial')
    ${!isSuperuser && company_id ? "AND s.company_id = :company_id" : ""}
  `, { replacements: { company_id }, type: Sequelize.QueryTypes.SELECT });

  const lowStock = await sequelize.query(`
    SELECT p.id, p.name, p.unit, p.min_stock, COALESCE(SUM(ps.qty), 0) as total_stock
    FROM products p
    LEFT JOIN product_stock ps ON ps.product_id = p.id
    WHERE p.min_stock > 0
    ${!isSuperuser && company_id ? "AND p.company_id = :company_id" : ""}
    GROUP BY p.id, p.name, p.unit, p.min_stock
    HAVING COALESCE(SUM(ps.qty), 0) < p.min_stock
    ORDER BY total_stock ASC
    LIMIT 10
  `, { replacements: { company_id }, type: Sequelize.QueryTypes.SELECT });

  const purchasesMonth = await Purchase.findOne({
    where: { ...tenantWhere, created_at: { [Op.gte]: month } },
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
