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
    const [kpiToday, kpiMonth] = await Promise.all([
      Sale.findOne({
        where: { created_at: { [Op.gte]: today }, status: { [Op.ne]: 'anulado' } },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("total")), 0), "revenue"],
        ],
        raw: true,
      }),
      Sale.findOne({
        where: { created_at: { [Op.gte]: month }, status: { [Op.ne]: 'anulado' } },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("total")), 0), "revenue"],
        ],
        raw: true,
      }),
    ]);

    // ── Ingresos Reales (Pagos Recibidos) ──────────────────────
    const [incomeToday, incomeMonth] = await Promise.all([
      sequelize.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE created_at >= :today`, { replacements: { today }, type: Sequelize.QueryTypes.SELECT }),
      sequelize.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE created_at >= :month`, { replacements: { month }, type: Sequelize.QueryTypes.SELECT }),
    ]);

    // ── Cash in Hand (Saldo total disponible) ─────────────────
    const cashInHand = await sequelize.query(`
        SELECT COALESCE(SUM(amount), 0) as total 
        FROM payments
    `, { type: Sequelize.QueryTypes.SELECT });

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
        where: { 
            created_at: { [Op.gte]: month }, 
            status: { [Op.notIn]: ['anulado', 'eliminado'] } 
        },
        required: true,
      }],
      group: ["SaleItem.product_id", "SaleItem.name"],
      order: [[Sequelize.literal("total_qty"), "DESC"]],
      limit: 5,
      raw: true,
    });

    // ── Ventas por día (últimos 30 días) ──────────────────────
    const salesByDay = await sequelize.query(`
       SELECT CAST(created_at AS DATE) AS day,
              COUNT(*)::int AS count,
              COALESCE(SUM(total), 0)::float AS revenue
       FROM sales
       WHERE created_at >= NOW() - INTERVAL '30 days' 
         AND status NOT IN ('anulado', 'eliminado')
       GROUP BY CAST(created_at AS DATE)
       ORDER BY day ASC
    `, { type: Sequelize.QueryTypes.SELECT });

    // ── Cuentas por cobrar (facturas pendientes) ───────────────
    // Usamos una consulta SQL directa para evitar problemas de alias con Sequelize
    const pendingResults = await sequelize.query(`
        SELECT 
            COUNT(id) as count,
            COALESCE(SUM(total - (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.sale_id = s.id)), 0) as balance
        FROM sales s
        WHERE s.status IN ('pendiente', 'parcial')
    `, { type: Sequelize.QueryTypes.SELECT });

    // ── Productos con stock bajo (Suma Global) ─────────────────
    const lowStock = await sequelize.query(`
        SELECT p.id, p.name, p.unit, p.min_stock, COALESCE(SUM(ps.qty), 0) as total_stock
        FROM products p
        LEFT JOIN product_stock ps ON ps.product_id = p.id
        WHERE p.min_stock > 0
        GROUP BY p.id, p.name, p.unit, p.min_stock
        HAVING COALESCE(SUM(ps.qty), 0) < p.min_stock
        ORDER BY total_stock ASC
        LIMIT 10
    `, { type: Sequelize.QueryTypes.SELECT });

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
            income:  parseFloat(incomeToday[0]?.total || 0),
          },
          month: {
            sales:   parseInt(kpiMonth?.count   || 0),
            revenue: parseFloat(kpiMonth?.revenue || 0),
            income:  parseFloat(incomeMonth[0]?.total || 0),
          },
          cash_in_hand: parseFloat(cashInHand[0]?.total || 0)
        },
        top_products: topProducts.map(p => ({
          product_id:    p.product_id,
          name:          p.name,
          total_qty:     parseFloat(p.total_qty   || 0),
          total_revenue: parseFloat(p.total_revenue || 0),
        })),
        sales_by_day: salesByDay,
        pending_bills: {
          count:   parseInt(pendingResults[0]?.count   || 0),
          balance: parseFloat(pendingResults[0]?.balance || 0),
        },
        low_stock: lowStock,
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
