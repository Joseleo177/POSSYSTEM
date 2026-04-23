const { Sequelize, Customer, Sale, SaleItem, Purchase, Payment, Currency } = require("../../models");

async function getAll({ search, type, limit = 100, offset = 0 }, req) {
  const company_id  = req.employee?.company_id ?? null;
  const isSuperuser = !!req.is_superuser;
  const where = {};
  if (!isSuperuser && company_id) where.company_id = company_id;
  if (type && ["cliente", "proveedor"].includes(type)) where.type = type;
  if (search) {
    where[Sequelize.Op.or] = [
      { name:     { [Sequelize.Op.iLike]: `%${search}%` } },
      { phone:    { [Sequelize.Op.iLike]: `%${search}%` } },
      { email:    { [Sequelize.Op.iLike]: `%${search}%` } },
      { rif:      { [Sequelize.Op.iLike]: `%${search}%` } },
      { tax_name: { [Sequelize.Op.iLike]: `%${search}%` } },
    ];
  }

  const { count, rows: customers } = await Customer.findAndCountAll({
    where,
    attributes: {
      include: [
        [Sequelize.fn("COUNT", Sequelize.col("Sales.id")), "total_purchases"],
        [Sequelize.literal(`(
          SELECT COALESCE(SUM(s.total), 0) FROM sales s
          WHERE s.customer_id = "Customer"."id" AND s.status = 'pagado'
        )`), "total_spent"],
        [Sequelize.literal(`(
          SELECT COALESCE(SUM(s.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.sale_id = s.id), 0)), 0)
          FROM sales s WHERE s.customer_id = "Customer"."id" AND s.status IN ('pendiente','parcial')
        )`), "total_debt"],
      ]
    },
    include: [{ model: Sale, attributes: [] }],
    group:    ['Customer.id'],
    order:    [['name', 'ASC']],
    limit:    parseInt(limit),
    offset:   parseInt(offset),
    subQuery: false,
    distinct: true,
    raw:      true,
  });

  customers.forEach(c => {
    c.total_purchases = parseInt(c.total_purchases || 0);
    c.total_spent     = parseFloat(c.total_spent   || 0);
    c.total_debt      = parseFloat(c.total_debt    || 0);
  });

  return { data: customers, total: Array.isArray(count) ? count.length : count };
}

async function getOne(id) {
  const customer = await Customer.findOne({
    where: { id },
    attributes: {
      include: [
        [Sequelize.fn("COUNT", Sequelize.col("Sales.id")), "total_purchases"],
        [Sequelize.literal(`(
          SELECT COALESCE(SUM(s.total), 0) FROM sales s
          WHERE s.customer_id = "Customer"."id" AND s.status = 'pagado'
        )`), "total_spent"],
        [Sequelize.fn("MAX", Sequelize.col("Sales.created_at")), "last_purchase_at"],
        [Sequelize.literal(`(
          SELECT COALESCE(SUM(s.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.sale_id = s.id), 0)), 0)
          FROM sales s WHERE s.customer_id = "Customer"."id" AND s.status IN ('pendiente','parcial')
        )`), "total_debt"],
      ]
    },
    include: [{ model: Sale, attributes: [] }],
    group: ['Customer.id'],
    raw:   true,
  });

  if (!customer) { const e = new Error("Cliente no encontrado"); e.status = 404; throw e; }

  customer.total_purchases = parseInt(customer.total_purchases || 0);
  customer.total_spent     = parseFloat(customer.total_spent   || 0);
  customer.total_debt      = parseFloat(customer.total_debt    || 0);

  return { data: customer };
}

async function getCustomerPurchases(id, { limit = 50, offset = 0 }) {
  const customer = await Customer.findByPk(id, { attributes: ['id', 'name'] });
  if (!customer) { const e = new Error("Cliente no encontrado"); e.status = 404; throw e; }

  const { count, rows } = await Sale.findAndCountAll({
    where: { customer_id: id },
    attributes: {
      include: [
        'id', 'total', 'status', 'currency_id', 'exchange_rate', 'created_at',
        [Sequelize.literal(`(SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = "Sale"."id")`), 'amount_paid'],
      ]
    },
    include: [
      { model: SaleItem, attributes: ['name', 'price', 'quantity', 'subtotal'] },
      { model: Currency,  attributes: ['symbol', 'code'], required: false },
    ],
    order:  [['created_at', 'DESC']],
    limit:  parseInt(limit),
    offset: parseInt(offset),
  });

  const data = rows.map(s => {
    const sale = s.toJSON();
    sale.items           = sale.SaleItems ?? [];
    sale.currency_symbol = sale.Currency?.symbol ?? null;
    sale.currency_code   = sale.Currency?.code   ?? null;
    sale.amount_paid     = parseFloat(sale.amount_paid || 0);
    sale.balance         = parseFloat((parseFloat(sale.total) - sale.amount_paid).toFixed(2));
    delete sale.SaleItems;
    delete sale.Currency;
    return sale;
  });

  return { customer, data, total: count };
}

function buildPayload({ type, name, phone, email, address, rif, tax_name, notes }) {
  if (!name) { const e = new Error("El nombre es requerido");      e.status = 400; throw e; }
  if (!rif)  { const e = new Error("La cédula / RIF es requerida"); e.status = 400; throw e; }
  const recordType = ["cliente", "proveedor"].includes(type) ? type : "cliente";
  return {
    type:     recordType,
    name,
    phone:    phone    || null,
    email:    email    || null,
    address:  address  || null,
    rif:      rif      ? rif.toUpperCase() : null,
    tax_name: recordType === "proveedor" ? (tax_name || null) : null,
    notes:    notes    || null,
  };
}

function wrapUniqueError(err) {
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.parent?.constraint?.includes("email") ? "correo" : "RIF/Cédula";
    const e = new Error(`Ese ${field} ya está registrado`);
    e.status = 409;
    throw e;
  }
  throw err;
}

async function createCustomer(body) {
  try {
    const payload  = buildPayload(body);
    const customer = await Customer.create(payload);
    return { data: customer };
  } catch (err) {
    wrapUniqueError(err);
  }
}

async function updateCustomer(id, body) {
  try {
    const payload  = buildPayload(body);
    const customer = await Customer.findByPk(id);
    if (!customer) { const e = new Error("Registro no encontrado"); e.status = 404; throw e; }
    await customer.update(payload);
    return { data: customer };
  } catch (err) {
    wrapUniqueError(err);
  }
}

async function deleteCustomer(id) {
  const customer = await Customer.findByPk(id);
  if (!customer) { const e = new Error("Registro no encontrado"); e.status = 404; throw e; }

  const saleCount     = await Sale.count({ where: { customer_id: id } });
  if (saleCount > 0)  { const e = new Error("No se puede eliminar: tiene ventas asociadas");  e.status = 400; throw e; }

  const purchaseCount = await Purchase.count({ where: { supplier_id: id } });
  if (purchaseCount > 0) { const e = new Error("No se puede eliminar: tiene compras asociadas"); e.status = 400; throw e; }

  await customer.destroy();
  return { message: "Registro eliminado exitosamente" };
}

module.exports = { getAll, getOne, getCustomerPurchases, createCustomer, updateCustomer, deleteCustomer };
