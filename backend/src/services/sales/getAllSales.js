const { Sale, SaleItem, Customer, Employee, Currency, Warehouse, Serie, Sequelize, Op, PAYMENT_METHODS } = require("./shared");

module.exports = async function getAllSales(query) {
  const { limit = 50, offset = 0, date_from, date_to, payment_method, status, serie_id, search } = query;

  const where = {};
  if (date_from || date_to) {
    where.created_at = {};
    if (date_from) where.created_at[Op.gte] = date_from;
    if (date_to) where.created_at[Op.lt] = Sequelize.literal(`('${date_to}'::date + INTERVAL '1 day')`);
  }
  if (payment_method && PAYMENT_METHODS.includes(payment_method)) where.payment_method = payment_method;
  if (status) where.status = status;
  if (serie_id) where.serie_id = parseInt(serie_id, 10);

  if (search) {
    where[Op.or] = [
      { invoice_number: { [Op.iLike]: `%${search}%` } },
      { [Op.and]: Sequelize.literal(`"Customer"."name" ILIKE '%${search}%'`) },
      { [Op.and]: Sequelize.literal(`"Customer"."rif" ILIKE '%${search}%'`) },
    ];
  }

  const { count, rows: sales } = await Sale.findAndCountAll({
    where,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    order: [["created_at", "DESC"]],
    attributes: {
      include: [
        [Sequelize.literal('(SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = "Sale"."id")'), "amount_paid"],
        [Sequelize.literal('(SELECT COALESCE(SUM(total),0) FROM returns WHERE sale_id = "Sale"."id")'), "total_returned"],
        [Sequelize.literal('(SELECT exchange_rate FROM payments WHERE sale_id = "Sale"."id" ORDER BY created_at DESC LIMIT 1)'), "final_payment_rate"],
      ],
    },
    include: [
      { model: Customer, attributes: ["name", "rif"], required: false },
      { model: Employee, attributes: ["full_name"], required: false },
      { model: Currency, attributes: ["symbol", "code"], required: false },
      { model: Warehouse, attributes: ["name"], required: false },
      { model: Serie, attributes: ["name", "prefix"], required: false },
      { model: SaleItem, required: true },
    ],
    distinct: true,
  });

  const data = sales.map((s) => {
    const item = s.toJSON();
    item.customer_name = item.Customer?.name ?? null;
    item.customer_rif  = item.Customer?.rif ?? null;
    item.employee_name = item.Employee?.full_name ?? null;
    item.currency_symbol = item.Currency?.symbol ?? null;
    item.currency_code = item.Currency?.code ?? null;
    item.warehouse_name = item.Warehouse?.name ?? null;
    item.serie_name = item.Serie?.name ?? null;
    item.items = item.SaleItems ?? [];
    item.amount_paid = parseFloat(item.amount_paid || 0);
    const totalRet = parseFloat(item.total_returned || 0);
    item.balance = parseFloat((parseFloat(item.total) - totalRet - item.amount_paid).toFixed(2));
    ["Customer", "Employee", "Currency", "Warehouse", "Serie", "SaleItems"].forEach((k) => delete item[k]);
    return item;
  });

  return { data, total: count };
};
