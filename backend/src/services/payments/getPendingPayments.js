const { Payment, Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Sequelize, Op, getSaleBalance } = require("./shared");

module.exports = async function getPendingPayments(query, tenant = {}) {
  const { limit = 100, offset = 0, date_from, date_to, search, warehouse_id } = query;
  const { company_id, isSuperuser, allowedWarehouses } = tenant;

  const andClauses = [
    { status: { [Op.in]: ["borrador", "pendiente", "parcial"] } },
  ];

  if (company_id) {
    andClauses.push({ company_id });
  }

  // Aquí la consulta es sobre sales, así que el almacén se filtra directo.
  if (warehouse_id) {
    andClauses.push({ warehouse_id: parseInt(warehouse_id, 10) });
  } else if (Array.isArray(allowedWarehouses)) {
    andClauses.push({ warehouse_id: { [Op.in]: allowedWarehouses } });
  }

  // Filtro por diario de pago (caja / banco) asignado a la factura
  const pj = parseInt(query.payment_journal_id, 10);
  if (Number.isInteger(pj)) andClauses.push({ payment_journal_id: pj });

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
    attributes: {
      include: [
        // Suma precisa de líneas (sin truncar a 2 dec). El frontend la usa para convertir a Bs.
        [Sequelize.literal('(SELECT COALESCE(SUM(subtotal),0) FROM sale_items WHERE sale_id = "Sale"."id")'), "total_precise"],
      ],
    },
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
      // El saldo se deriva de los pagos reales (pagos − vuelto + crédito aplicado),
      // igual que createPayment/removePayment. Antes referenciaba una variable inexistente.
      const amount_paid = parseFloat(await getSaleBalance(item.id)) || 0;
      const rawBalance = parseFloat((parseFloat(item.total) - amount_paid).toFixed(6));
      const balance = rawBalance <= 0.10 ? 0 : rawBalance;

      item.customer_name = item.Customer?.name ?? null;
      item.customer_rif = item.Customer?.rif ?? null;
      item.employee_name = item.Employee?.full_name ?? null;
      item.currency_code = item.Currency?.code ?? null;
      item.currency_symbol = item.Currency?.symbol ?? null;
      item.journal_name = item.PaymentJournal?.name ?? null;
      item.journal_color = item.PaymentJournal?.color ?? null;
      item.items = item.SaleItems ?? [];
      item.amount_paid = amount_paid;
      item.total_precise = parseFloat(item.total_precise || item.total || 0);
      item.balance = balance;
      ["Customer", "Employee", "Currency", "PaymentJournal", "SaleItems"].forEach((k) => delete item[k]);
      return item;
    })
  );

  return { data, total: count };
};
