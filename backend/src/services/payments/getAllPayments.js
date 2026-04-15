const { Payment, Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Sequelize, Op } = require("./shared");

module.exports = async function getAllPayments(query, tenant = {}) {
  const { date_from, date_to, limit = 100, offset = 0, search } = query;
  const { company_id, isSuperuser } = tenant;
  const andClauses = [
    // Excluir egresos de cambio (amount < 0) del historial visible
    { amount: { [Op.gt]: 0 } },
  ];

  if (!isSuperuser && company_id) {
    andClauses.push({ company_id });
  }

  if (date_from) andClauses.push(Sequelize.literal(`("Payment"."created_at" AT TIME ZONE 'America/Caracas')::date >= '${date_from}'`));
  if (date_to)   andClauses.push(Sequelize.literal(`("Payment"."created_at" AT TIME ZONE 'America/Caracas')::date <= '${date_to}'`));

  if (search) {
    const esc = search.replace(/'/g, "''");
    andClauses.push({
      [Op.or]: [
        Sequelize.literal(`"Payment"."sale_id" IN (SELECT id FROM sales WHERE invoice_number ILIKE '%${esc}%')`),
        Sequelize.literal(`"Payment"."sale_id" IN (SELECT id FROM sales WHERE customer_id IN (SELECT id FROM customers WHERE name ILIKE '%${esc}%' OR rif ILIKE '%${esc}%'))`),
        { reference_number: { [Op.iLike]: `%${search}%` } },
      ],
    });
  }

  const where = { [Op.and]: andClauses };

  const { count, rows } = await Payment.findAndCountAll({
    where,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    order: [["created_at", "DESC"]],
    include: [
      { model: Customer, attributes: ["name", "rif"], required: false },
      { model: Employee, attributes: ["full_name"], required: false },
      { model: Currency, attributes: ["symbol", "code"], required: false },
      { model: PaymentJournal, attributes: ["name", "color"], required: false },
      {
        model: Sale,
        attributes: ["id", "total", "status", "exchange_rate", "currency_id", "created_at", "invoice_number"],
        required: true,
        include: [{ model: SaleItem, attributes: ["name", "quantity", "price", "subtotal"] }],
      },
    ],
  });

  const data = rows.map((p) => {
    const item = p.toJSON();
    item.customer_name = item.Customer?.name ?? null;
    item.customer_rif = item.Customer?.rif ?? null;
    item.employee_name = item.Employee?.full_name ?? null;
    item.currency_symbol = item.Currency?.symbol ?? null;
    item.currency_code = item.Currency?.code ?? null;
    item.journal_name = item.PaymentJournal?.name ?? null;
    item.journal_color = item.PaymentJournal?.color ?? null;
    item.sale_total = item.Sale?.total ?? null;
    item.sale_status = item.Sale?.status ?? null;
    item.sale_items = item.Sale?.SaleItems ?? [];
    item.invoice_number = item.Sale?.invoice_number ?? null;
    ["Customer", "Employee", "Currency", "PaymentJournal"].forEach((k) => delete item[k]);
    if (item.Sale) delete item.Sale.SaleItems;
    return item;
  });

  return { data, total: count };
};
