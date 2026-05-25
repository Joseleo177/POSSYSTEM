const { Payment, Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Sequelize, Op } = require("./shared");

module.exports = async function getPendingPayments(query, tenant = {}) {
  const { limit = 100, offset = 0, date_from, date_to, search } = query;
  const { company_id, isSuperuser } = tenant;

  const andClauses = [
    { status: { [Op.in]: ["borrador", "pendiente", "parcial"] } },
  ];

  if (!isSuperuser && company_id) {
    andClauses.push({ company_id });
  }

  const sd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const safeFrom = sd(date_from);
  const safeTo   = sd(date_to);
  if (safeFrom) andClauses.push(Sequelize.literal(`("Sale"."created_at" AT TIME ZONE 'America/Caracas')::date >= '${safeFrom}'`));
  if (safeTo)   andClauses.push(Sequelize.literal(`("Sale"."created_at" AT TIME ZONE 'America/Caracas')::date <= '${safeTo}'`));

  if (search) {
    const safe = search.slice(0, 100).replace(/[\x00-\x1f\\]/g, '');
    const esc  = safe.replace(/'/g, "''");
    andClauses.push({
      [Op.or]: [
        { invoice_number: { [Op.iLike]: `%${safe}%` } },
        Sequelize.literal(`"Sale"."customer_id" IN (SELECT id FROM customers WHERE name ILIKE '%${esc}%' OR rif ILIKE '%${esc}%')`),
      ],
    });
  }

  const where = { [Op.and]: andClauses };

  const { count, rows: sales } = await Sale.findAndCountAll({
    where,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    order: [["created_at", "DESC"]],
    include: [
      { model: Customer, attributes: ["name", "rif"], required: false },
      { model: Employee, attributes: ["full_name"], required: false },
      { model: Currency, attributes: ["symbol", "code"], required: false },
      { model: PaymentJournal, attributes: ["name", "color"], required: false },
      { model: SaleItem, required: true },
    ],
    distinct: true,
  });

  const data = await Promise.all(
    sales.map(async (s) => {
      const item = s.toJSON();
      const amount_paid = parseFloat(await Payment.sum("amount", { where: { sale_id: s.id } }) || 0);
      const balance = parseFloat((parseFloat(item.total) - amount_paid).toFixed(2));

      item.customer_name = item.Customer?.name ?? null;
      item.customer_rif = item.Customer?.rif ?? null;
      item.employee_name = item.Employee?.full_name ?? null;
      item.currency_code = item.Currency?.code ?? null;
      item.currency_symbol = item.Currency?.symbol ?? null;
      item.journal_name = item.PaymentJournal?.name ?? null;
      item.journal_color = item.PaymentJournal?.color ?? null;
      item.items = item.SaleItems ?? [];
      item.amount_paid = amount_paid;
      item.balance = balance;
      ["Customer", "Employee", "Currency", "PaymentJournal", "SaleItems"].forEach((k) => delete item[k]);
      return item;
    })
  );

  return { data, total: count };
};
