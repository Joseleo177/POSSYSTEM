const { Payment, Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Sequelize, Op } = require("./shared");

module.exports = async function getAllPayments(query, tenant = {}) {
  const { date_from, date_to, limit = 100, offset = 0, search, warehouse_id } = query;
  const { company_id, isSuperuser, allowedWarehouses } = tenant;

  // Un cobro no guarda sucursal propia: la hereda de la venta, así que el filtro va sobre
  // el join con sales (que ya es required).
  const saleWhere = {};
  if (warehouse_id) {
    saleWhere.warehouse_id = parseInt(warehouse_id, 10);
  } else if (Array.isArray(allowedWarehouses)) {
    saleWhere.warehouse_id = { [Op.in]: allowedWarehouses };
  }
  const andClauses = [
    // Excluir egresos de cambio (amount < 0) del historial visible
    { amount: { [Op.gt]: 0 } },
  ];

  if (company_id) {
    andClauses.push({ company_id });
  }

  // Filtro por diario de pago (caja / banco) del cobro
  const pj = parseInt(query.payment_journal_id, 10);
  if (Number.isInteger(pj)) andClauses.push({ payment_journal_id: pj });

  const sd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const safeFrom = sd(date_from);
  const safeTo   = sd(date_to);
  if (safeFrom) andClauses.push(Sequelize.literal(`("Payment"."created_at" AT TIME ZONE 'America/Caracas')::date >= '${safeFrom}'`));
  if (safeTo)   andClauses.push(Sequelize.literal(`("Payment"."created_at" AT TIME ZONE 'America/Caracas')::date <= '${safeTo}'`));

  if (search) {
    const safe = search.slice(0, 100).replace(/[\x00-\x1f\\]/g, '');
    const esc  = safe.replace(/'/g, "''");
    andClauses.push({
      [Op.or]: [
        Sequelize.literal(`"Payment"."sale_id" IN (SELECT id FROM sales WHERE invoice_number ILIKE '%${esc}%')`),
        Sequelize.literal(`"Payment"."sale_id" IN (SELECT id FROM sales WHERE customer_id IN (SELECT id FROM customers WHERE name ILIKE '%${esc}%' OR rif ILIKE '%${esc}%'))`),
        { reference_number: { [Op.iLike]: `%${safe}%` } },
      ],
    });
  }

  const where = { [Op.and]: andClauses };

  const { count, rows } = await Payment.findAndCountAll({
    where,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    order: [["created_at", "DESC"]],
    subQuery: false,
    distinct: true,
    include: [
      { model: Customer, attributes: ["name", "rif"], required: false },
      { model: Employee, attributes: ["full_name"], required: false },
      { model: Currency, attributes: ["symbol", "code"], required: false },
      { model: PaymentJournal, attributes: ["name", "color"], required: false },
      {
        model: Sale,
        attributes: ["id", "total", "status", "exchange_rate", "currency_id", "created_at", "invoice_number"],
        required: true,
        ...(Object.keys(saleWhere).length ? { where: saleWhere } : {}),
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

  // Suma del filtro COMPLETO, no de la página: con 50 registros por página, totalizar solo
  // lo visible daría una cifra que no corresponde a lo que el usuario filtró. Va en moneda
  // base porque es la única común — sumar bolívares con divisas no significaría nada.
  // Mismo where y mismo join required que el listado, o el total no cuadraría con las filas.
  const [totals] = await Payment.findAll({
    where,
    include: [{ model: Sale, attributes: [], required: true }],
    attributes: [
      [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("Payment.amount")), 0), "sum_base"],
      // Bolívares (o la moneda que sea) REALMENTE recibidos: cada cobro a la tasa del día en
      // que se hizo. Es distinto de convertir el total base a la tasa de hoy, que es lo que
      // hacía el pie del listado y por eso no cuadraba con el estado de cuenta del diario.
      [Sequelize.literal(`COALESCE(SUM("Payment"."amount" * COALESCE("Payment"."exchange_rate", 1)), 0)`), "sum_local"],
      // Solo tiene sentido mostrar sum_local si todo el filtro es de una misma moneda: si no,
      // estaría sumando bolívares con divisas.
      [Sequelize.literal(`COUNT(DISTINCT "Payment"."currency_id")`), "currency_count"],
      [Sequelize.literal(`MIN("Payment"."currency_id")`), "currency_id"],
    ],
    raw: true,
    subQuery: false,
  });

  return {
    data,
    total: count,
    sum_base:       parseFloat(totals?.sum_base  || 0),
    sum_local:      parseFloat(totals?.sum_local || 0),
    currency_count: parseInt(totals?.currency_count || 0, 10),
    currency_id:    totals?.currency_id ?? null,
  };
};
