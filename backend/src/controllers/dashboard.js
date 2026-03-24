const { Sale, SaleItem, Product, Customer, Purchase, ProductStock, Warehouse, Sequelize, sequelize } = require("../models");
const { Op } = Sequelize;

// GET /api/dashboard
const getDashboard = async (req, res) => {
  try {
    const now     = new Date();
    const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const week    = new Date(today); week.setDate(week.getDate() - 7);
    const month   = new Date(today); month.setDate(month.getDate() - 30);

    // ── KPIs de ventas ─────────────────────────────────────────
    const [kpiToday, kpiWeek, kpiMonth] = await Promise.all([
      Sale.findOne({
        where: { created_at: { [Op.gte]: today } },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("total")), 0), "revenue"],
        ],
        raw: true,
      }),
      Sale.findOne({
        where: { created_at: { [Op.gte]: week } },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("total")), 0), "revenue"],
        ],
        raw: true,
      }),
      Sale.findOne({
        where: { created_at: { [Op.gte]: month } },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("total")), 0), "revenue"],
        ],
        raw: true,
      }),
    ]);

    // ── Top 5 productos más vendidos (30 días) ─────────────────
    const topProducts = await SaleItem.findAll({
      attributes: [
        "product_id",
        "name",
        [Sequelize.fn("SUM", Sequelize.col("quantity")), "total_qty"],
        [Sequelize.fn("SUM", Sequelize.col("subtotal")),  "total_revenue"],
      ],
      include: [{
        model: Sale,
        attributes: [],
        where: { created_at: { [Op.gte]: month } },
        required: true,
      }],
      group: ["SaleItem.product_id", "SaleItem.name"],
      order: [[Sequelize.literal("total_qty"), "DESC"]],
      limit: 5,
      raw: true,
    });

    // ── Ventas por día (últimos 30 días) ──────────────────────
    const salesByDay = await sequelize.query(
      `SELECT DATE(created_at) AS day,
              COUNT(*)::int    AS count,
              COALESCE(SUM(total), 0)::float AS revenue
       FROM sales
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    // ── Cuentas por cobrar (facturas pendientes) ───────────────
    const pendingBillsResult = await Sale.findOne({
      where: { status: { [Op.in]: ["pendiente", "parcial"] } },
      attributes: [
        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
        [Sequelize.literal(`COALESCE(SUM(total - (
          SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = "Sale"."id"
        )), 0)`), "balance"],
      ],
      raw: true,
    });

    // ── Productos con stock bajo ───────────────────────────────
    const lowStock = await Product.findAll({
      where: {
        min_stock: { [Op.gt]: 0 },
        stock: { [Op.lt]: Sequelize.col('min_stock') }
      },
      attributes: ["id", "name", "stock", "min_stock", "unit"],
      order: [["stock", "ASC"]],
      limit: 10,
    });

    // ── Clientes nuevos este mes ───────────────────────────────
    const newCustomers = await Customer.count({
      where: { created_at: { [Op.gte]: month } },
    });

    // ── Compras del mes ───────────────────────────────────────
    const purchasesMonth = await Purchase.findOne({
      where: { created_at: { [Op.gte]: month } },
      attributes: [
        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
        [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("total")), 0), "total"],
      ],
      raw: true,
    });

    res.json({
      ok: true,
      data: {
        kpi: {
          today: {
            sales:   parseInt(kpiToday?.count   || 0),
            revenue: parseFloat(kpiToday?.revenue || 0),
          },
          week: {
            sales:   parseInt(kpiWeek?.count   || 0),
            revenue: parseFloat(kpiWeek?.revenue || 0),
          },
          month: {
            sales:   parseInt(kpiMonth?.count   || 0),
            revenue: parseFloat(kpiMonth?.revenue || 0),
          },
        },
        top_products: topProducts.map(p => ({
          product_id:    p.product_id,
          name:          p.name,
          total_qty:     parseFloat(p.total_qty   || 0),
          total_revenue: parseFloat(p.total_revenue || 0),
        })),
        sales_by_day: salesByDay,
        pending_bills: {
          count:   parseInt(pendingBillsResult?.count   || 0),
          balance: parseFloat(pendingBillsResult?.balance || 0),
        },
        low_stock: lowStock.map(p => p.toJSON()),
        new_customers: newCustomers,
        purchases_month: {
          count: parseInt(purchasesMonth?.count || 0),
          total: parseFloat(purchasesMonth?.total || 0),
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener dashboard" });
  }
};

module.exports = { getDashboard };
