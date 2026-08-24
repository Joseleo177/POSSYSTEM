const { Sequelize, sequelize, Customer, Sale, SaleItem, Purchase, Payment, Currency, Expense, ExpenseCategory, PaymentJournal } = require("../../models");
const { assertWarehouseAccess, employeeWarehouseIds, visibleWarehouseIds } = require("../../middleware/auth");
const { toLocalDate } = require("../../utils/localDate");

// Deuda, gasto y cantidad de compras de un contacto, acotados a las sucursales del empleado.
// El contacto es de la empresa —el mismo cliente compra en varias sucursales— pero sus
// saldos se leen desde la sucursal que los consulta: si no, un cajero ve una deuda que no
// se generó en su caja y que no puede explicar ni cobrar.
async function warehouseFragments(req) {
  const allowed = await visibleWarehouseIds(req);
  if (allowed === null) return { whS: '', whP: '' };          // admin: todas las sucursales

  const ids = allowed.filter(Number.isInteger);
  if (!ids.length) return { whS: 'AND FALSE', whP: 'AND FALSE' };

  const list = ids.join(',');
  return { whS: `AND s.warehouse_id IN (${list})`, whP: `AND p.warehouse_id IN (${list})` };
}

async function getAll({ search, type, debtors, limit = 100, offset = 0 }, req) {
  const company_id  = req.employee?.company_id ?? null;
  const { whS, whP } = await warehouseFragments(req);
  const where = {};
  if (company_id) where.company_id = company_id;
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
  if (debtors === 'true') {
    where[Sequelize.Op.and] = [
      ...(where[Sequelize.Op.and] || []),
      Sequelize.literal(`(
        SELECT COALESCE(SUM(s.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.sale_id = s.id), 0)), 0)
        FROM sales s WHERE s.customer_id = "Customer"."id" AND s.status IN ('borrador','pendiente','parcial') ${whS}
      ) > 0.01`),
    ];
  }

  const { count, rows: customers } = await Customer.findAndCountAll({
    where,
    attributes: {
      include: [
        [Sequelize.literal(`(
          CASE WHEN "Customer"."type" = 'proveedor' THEN (
            SELECT COUNT(p.id) FROM purchases p WHERE p.supplier_id = "Customer"."id" ${whP} 
          ) ELSE (
            SELECT COUNT(s.id) FROM sales s WHERE s.customer_id = "Customer"."id" ${whS} 
          ) END
        )`), "total_purchases"],
        [Sequelize.literal(`(
          CASE WHEN "Customer"."type" = 'proveedor' THEN (
            SELECT COALESCE(SUM(p.total), 0) FROM purchases p WHERE p.supplier_id = "Customer"."id" AND p.payment_status = 'pagado' ${whP}
          ) ELSE (
            SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.customer_id = "Customer"."id" AND s.status = 'pagado' ${whS}
          ) END
        )`), "total_spent"],
        [Sequelize.literal(`(
          CASE WHEN "Customer"."type" = 'proveedor' THEN (
            SELECT COALESCE(SUM(p.total - COALESCE((SELECT SUM(pp.amount) FROM purchase_payments pp WHERE pp.purchase_id = p.id), 0)), 0)
            FROM purchases p WHERE p.supplier_id = "Customer"."id" AND p.payment_status IN ('pendiente','parcial') ${whP}
          ) ELSE (
            SELECT COALESCE(SUM(s.total - COALESCE((SELECT SUM(py.amount) FROM payments py WHERE py.sale_id = s.id), 0)), 0)
            FROM sales s WHERE s.customer_id = "Customer"."id" AND s.status IN ('borrador','pendiente','parcial') ${whS}
          ) END
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

async function getOne(id, req) {
  const { whS, whP } = await warehouseFragments(req);

  const customer = await Customer.findOne({
    where: { id },
    attributes: {
      include: [
        [Sequelize.literal(`(
          CASE WHEN "Customer"."type" = 'proveedor' THEN (
            SELECT COUNT(p.id) FROM purchases p WHERE p.supplier_id = "Customer"."id" ${whP} 
          ) ELSE (
            SELECT COUNT(s.id) FROM sales s WHERE s.customer_id = "Customer"."id" ${whS} 
          ) END
        )`), "total_purchases"],
        [Sequelize.literal(`(
          CASE WHEN "Customer"."type" = 'proveedor' THEN (
            SELECT COALESCE(SUM(p.total), 0) FROM purchases p WHERE p.supplier_id = "Customer"."id" AND p.payment_status = 'pagado' ${whP}
          ) ELSE (
            SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.customer_id = "Customer"."id" AND s.status = 'pagado' ${whS}
          ) END
        )`), "total_spent"],
        [Sequelize.literal(`(
          CASE WHEN "Customer"."type" = 'proveedor' THEN (
            SELECT MAX(p.created_at) FROM purchases p WHERE p.supplier_id = "Customer"."id" ${whP} 
          ) ELSE (
            SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = "Customer"."id" ${whS} 
          ) END
        )`), "last_purchase_at"],
        [Sequelize.literal(`(
          CASE WHEN "Customer"."type" = 'proveedor' THEN (
            SELECT COALESCE(SUM(p.total - COALESCE((SELECT SUM(pp.amount) FROM purchase_payments pp WHERE pp.purchase_id = p.id), 0)), 0)
            FROM purchases p WHERE p.supplier_id = "Customer"."id" AND p.payment_status IN ('pendiente','parcial') ${whP}
          ) ELSE (
            SELECT COALESCE(SUM(s.total - COALESCE((SELECT SUM(py.amount) FROM payments py WHERE py.sale_id = s.id), 0)), 0)
            FROM sales s WHERE s.customer_id = "Customer"."id" AND s.status IN ('borrador','pendiente','parcial') ${whS}
          ) END
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

async function getCustomerPurchases(id, { limit = 50, offset = 0 }, req) {
  const customer = await Customer.findByPk(id, { attributes: ['id', 'name', 'type'] });
  if (!customer) { const e = new Error("Cliente no encontrado"); e.status = 404; throw e; }

  // El detalle de facturas y órdenes del contacto sigue el mismo criterio que sus saldos:
  // solo las de las sucursales del empleado, para que la lista cuadre con el total.
  const allowed = await visibleWarehouseIds(req);
  const scope = Array.isArray(allowed) ? { warehouse_id: { [Sequelize.Op.in]: allowed } } : {};

  if (customer.type === 'proveedor') {
    const queryPurchases = (where, opts = {}) => Purchase.findAll({
      where: { supplier_id: id, ...scope, ...where },
      attributes: {
        include: [
          'id', 'total', 'payment_status', 'created_at',
          [Sequelize.literal(`(SELECT COALESCE(SUM(amount),0) FROM purchase_payments WHERE purchase_id = "Purchase"."id")`), 'amount_paid'],
        ]
      },
      order: [['created_at', 'DESC']],
      ...opts,
    });

    const mapPurchase = p => {
      const purchase = p.toJSON();
      purchase.status = purchase.payment_status; // Map for the UI
      purchase.amount_paid = parseFloat(purchase.amount_paid || 0);
      purchase.balance = parseFloat((parseFloat(purchase.total) - purchase.amount_paid).toFixed(6));
      return purchase;
    };

    const pendingRows = await queryPurchases({ payment_status: ['pendiente', 'parcial'] });
    const paidTotal = await Purchase.count({ where: { supplier_id: id, ...scope, payment_status: ['pagado'] } });
    const paidRows  = await queryPurchases({ payment_status: ['pagado'] }, { limit: parseInt(limit), offset: parseInt(offset) });

    return {
      customer,
      pending: pendingRows.map(mapPurchase),
      paid: paidRows.map(mapPurchase),
      paidTotal,
    };
  }

  // Cuentas por cobrar para clientes
  const querySales = (where, opts = {}) => Sale.findAll({
    where: { customer_id: id, ...scope, ...where },
    attributes: {
      include: [
        'id', 'total', 'status', 'currency_id', 'exchange_rate', 'created_at',
        [Sequelize.literal(`(SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = "Sale"."id")`), 'amount_paid'],
        // Por dónde entró el dinero. sale.currency_id solo dice en qué moneda estaba puesta la
        // pantalla al crear la venta, no cómo se cobró: una venta hecha en Ref. y cobrada por
        // CAJA BS aparecía como si hubiera entrado en divisas.
        [Sequelize.literal(`(
          SELECT string_agg(DISTINCT pj.name, ', ')
            FROM payments p JOIN payment_journals pj ON pj.id = p.payment_journal_id
           WHERE p.sale_id = "Sale"."id"
        )`), 'paid_journals'],
      ]
    },
    include: [
      { model: SaleItem, attributes: ['name', 'price', 'quantity', 'subtotal'] },
      { model: Currency,  attributes: ['symbol', 'code'], required: false },
    ],
    order: [['created_at', 'DESC']],
    ...opts,
  });

  const mapSale = s => {
    const sale = s.toJSON();
    sale.items           = sale.SaleItems ?? [];
    sale.currency_symbol = sale.Currency?.symbol ?? null;
    sale.currency_code   = sale.Currency?.code   ?? null;
    sale.amount_paid     = parseFloat(sale.amount_paid || 0);
    sale.balance         = parseFloat((parseFloat(sale.total) - sale.amount_paid).toFixed(6));
    delete sale.SaleItems;
    delete sale.Currency;
    return sale;
  };

  const pendingRows = await querySales({ status: ['borrador', 'pendiente', 'parcial'] });
  const paidTotal = await Sale.count({ where: { customer_id: id, ...scope, status: ['pagado'] } });
  const paidRows  = await querySales({ status: ['pagado'] }, { limit: parseInt(limit), offset: parseInt(offset) });

  return {
    customer,
    pending:   pendingRows.map(mapSale),
    paid:      paidRows.map(mapSale),
    paidTotal,
  };
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

async function adjustCredit(id, amount) {
  const customer = await Customer.findByPk(id);
  if (!customer) { const e = new Error("Cliente no encontrado"); e.status = 404; throw e; }
  if (isNaN(amount) || amount < 0) { const e = new Error("Monto inválido"); e.status = 400; throw e; }
  await customer.update({ credit_balance: parseFloat(amount.toFixed(6)) });
  return { data: customer };
}

async function creditRefund(id, { amount, journal_id, reference_date, notes, employee_id, warehouse_id }, req) {
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0)
    { const e = new Error("El monto debe ser mayor a cero"); e.status = 400; throw e; }
  if (!journal_id)
    { const e = new Error("Selecciona el diario de devolución"); e.status = 400; throw e; }
  if (!reference_date)
    { const e = new Error("La fecha de referencia es requerida"); e.status = 400; throw e; }

  const refundAmt = parseFloat(parseFloat(amount).toFixed(6));

  // El egreso que genera la devolución pertenece a una sucursal. Si la pantalla no manda
  // cuál, se usa el primer almacén asignado al empleado: la alternativa era dejarlo sin
  // sucursal y que no lo viera nadie salvo el admin.
  let refundWarehouseId = warehouse_id ? parseInt(warehouse_id) : null;
  if (refundWarehouseId) {
    await assertWarehouseAccess(req, refundWarehouseId);
  } else {
    const propios = await employeeWarehouseIds(employee_id);
    refundWarehouseId = propios[0] ?? null;
  }

  const t = await sequelize.transaction();
  try {
    const customer = await Customer.findByPk(id, { transaction: t, lock: true });
    if (!customer) { const e = new Error("Cliente no encontrado"); e.status = 404; throw e; }

    const available = parseFloat(customer.credit_balance || 0);
    if (refundAmt > available + 0.001)
      { const e = new Error(`Crédito insuficiente. Disponible: ${available.toFixed(2)}`); e.status = 400; throw e; }

    const journal = await PaymentJournal.findByPk(journal_id, {
      include: [{ model: Currency, attributes: ['id', 'exchange_rate'], required: false }],
      transaction: t,
    });
    if (!journal) { const e = new Error("Diario no encontrado"); e.status = 404; throw e; }

    const rate       = parseFloat(journal.Currency?.exchange_rate || 1);
    const currencyId = journal.currency_id || null;

    const [cat] = await ExpenseCategory.findOrCreate({
      where:    { name: "Devolución de Crédito" },
      defaults: { name: "Devolución de Crédito", active: true },
      transaction: t,
    });

    await Expense.create({
      description:        `Devolución de crédito — ${customer.name}`,
      amount:             refundAmt,
      rate,
      category_id:        cat.id,
      payment_journal_id: journal_id,
      currency_id:        currencyId,
      employee_id:        employee_id || null,
      warehouse_id:       refundWarehouseId,
      // `reference_date` viene del formulario como 'YYYY-MM-DD'. Con `new Date()` a secas JS
      // lo lee como medianoche UTC y el egreso quedaba fechado el día anterior —y este caso
      // fallaba en todos los entornos, no solo en Vercel, porque no depende de la TZ del
      // proceso sino del propio parseo del string.
      date:               toLocalDate(reference_date),
      notes:              notes?.trim() || null,
      status:             'activo',
    }, { transaction: t });

    await Customer.decrement(
      { credit_balance: refundAmt },
      { where: { id }, transaction: t }
    );

    await t.commit();
    const updated = await Customer.findByPk(id);
    return { data: updated };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

module.exports = { getAll, getOne, getCustomerPurchases, createCustomer, updateCustomer, deleteCustomer, adjustCredit, creditRefund };
