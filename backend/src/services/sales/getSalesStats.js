const { Sale, Sequelize, Op } = require("./shared");

module.exports = async function getSalesStats(query) {
  const { date_from, date_to } = query;
  const where = {};
  if (date_from || date_to) {
    where.created_at = {};
    if (date_from) where.created_at[Op.gte] = date_from;
    if (date_to) where.created_at[Op.lt] = Sequelize.literal(`('${date_to}'::date + INTERVAL '1 day')`);
  }

  const stats = await Sale.findOne({
    where,
    attributes: [
      [Sequelize.fn("COUNT", Sequelize.col("id")), "total_sales"],
      [Sequelize.fn("SUM", Sequelize.col("total")), "total_revenue"],
      [Sequelize.fn("AVG", Sequelize.col("total")), "avg_sale"],
      [Sequelize.fn("MAX", Sequelize.col("total")), "max_sale"],
      [Sequelize.literal('COUNT(CASE WHEN "created_at" >= CURRENT_DATE THEN 1 END)'), "sales_today"],
      [Sequelize.literal('COALESCE(SUM(CASE WHEN "created_at" >= CURRENT_DATE THEN total ELSE 0 END), 0)'), "revenue_today"],
    ],
    raw: true,
  });

  const byMethod = await Sale.findAll({
    where,
    attributes: [
      "payment_method",
      [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
      [Sequelize.fn("SUM", Sequelize.col("total")), "total"],
    ],
    group: ["payment_method"],
    order: [[Sequelize.literal("total"), "DESC"]],
    raw: true,
  });

  return {
    total_sales: parseInt(stats.total_sales || 0, 10),
    total_revenue: parseFloat(stats.total_revenue || 0),
    avg_sale: parseFloat(stats.avg_sale || 0),
    max_sale: parseFloat(stats.max_sale || 0),
    sales_today: parseInt(stats.sales_today || 0, 10),
    revenue_today: parseFloat(stats.revenue_today || 0),
    by_method: byMethod,
  };
};
