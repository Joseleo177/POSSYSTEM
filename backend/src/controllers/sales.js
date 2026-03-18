const { 
  Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Warehouse, Product, ProductStock, Sequelize, sequelize 
} = require("../models");
const { Op } = Sequelize;

const PAYMENT_METHODS = ["efectivo", "transferencia", "pago_movil", "zelle", "punto_venta"];

// GET /api/sales
const getAll = async (req, res) => {
  try {
    const { limit = 50, offset = 0, date_from, date_to, payment_method } = req.query;
    
    const where = {};
    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) where.created_at[Op.gte] = date_from;
      if (date_to)   where.created_at[Op.lt]  = Sequelize.literal(`('${date_to}'::date + INTERVAL '1 day')`);
    }
    if (payment_method && PAYMENT_METHODS.includes(payment_method)) {
      where.payment_method = payment_method;
    }

    const { count, rows: sales } = await Sale.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        { model: Customer, attributes: ['name'], required: false },
        { model: Employee, attributes: ['full_name'], required: false },
        { model: Currency, attributes: ['symbol', 'code'], required: false },
        { model: PaymentJournal, attributes: ['name', 'color'], required: false },
        { model: Warehouse, attributes: ['name'], required: false },
        { model: SaleItem, required: true }
      ],
      distinct: true // Necesario para contar cabeceras correctamente con includes de items
    });

    const data = sales.map(s => {
      const item = s.toJSON();
      item.customer_name   = item.Customer?.name ?? null;
      item.employee_name   = item.Employee?.full_name ?? null;
      item.currency_symbol = item.Currency?.symbol ?? null;
      item.currency_code   = item.Currency?.code ?? null;
      item.journal_name    = item.PaymentJournal?.name ?? null;
      item.journal_color   = item.PaymentJournal?.color ?? null;
      item.warehouse_name  = item.Warehouse?.name ?? null;
      item.items = item.SaleItems ?? [];
      ['Customer','Employee','Currency','PaymentJournal','Warehouse','SaleItems'].forEach(k => delete item[k]);
      return item;
    });

    res.json({ ok: true, data, total: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener ventas" });
  }
};

// GET /api/sales/stats
const getStats = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const where = {};
    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) where.created_at[Op.gte] = date_from;
      if (date_to)   where.created_at[Op.lt]  = Sequelize.literal(`('${date_to}'::date + INTERVAL '1 day')`);
    }

    // Resumen general
    const stats = await Sale.findOne({
      where,
      attributes: [
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'total_sales'],
        [Sequelize.fn('SUM', Sequelize.col('total')), 'total_revenue'],
        [Sequelize.fn('AVG', Sequelize.col('total')), 'avg_sale'],
        [Sequelize.fn('MAX', Sequelize.col('total')), 'max_sale'],
        [Sequelize.literal(`COUNT(CASE WHEN "created_at" >= CURRENT_DATE THEN 1 END)`), 'sales_today'],
        [Sequelize.literal(`COALESCE(SUM(CASE WHEN "created_at" >= CURRENT_DATE THEN total ELSE 0 END), 0)`), 'revenue_today']
      ],
      raw: true
    });

    // Por método de pago
    const byMethod = await Sale.findAll({
      where,
      attributes: [
        'payment_method',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
        [Sequelize.fn('SUM', Sequelize.col('total')), 'total']
      ],
      group: ['payment_method'],
      order: [[Sequelize.literal('total'), 'DESC']],
      raw: true
    });

    res.json({ ok: true, data: { 
      total_sales: parseInt(stats.total_sales || 0),
      total_revenue: parseFloat(stats.total_revenue || 0),
      avg_sale: parseFloat(stats.avg_sale || 0),
      max_sale: parseFloat(stats.max_sale || 0),
      sales_today: parseInt(stats.sales_today || 0),
      revenue_today: parseFloat(stats.revenue_today || 0),
      by_method: byMethod 
    } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener estadísticas" });
  }
};

// POST /api/sales
const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      items, paid, customer_id, employee_id, currency_id,
      exchange_rate, payment_method, payment_journal_id,
      discount_amount, warehouse_id,
    } = req.body;

    if (!items?.length)    throw new Error("items es requerido");
    if (paid == null)      throw new Error("paid es requerido");
    if (!warehouse_id)     throw new Error("warehouse_id es requerido");

    let method = PAYMENT_METHODS.includes(payment_method) ? payment_method : "efectivo";
    if (payment_journal_id) {
      const journal = await PaymentJournal.findByPk(payment_journal_id, { transaction });
      if (journal) method = journal.type;
    }

    const discAmt   = parseFloat(discount_amount) || 0;
    const rate      = parseFloat(exchange_rate)   || 1;

    let total = 0;
    const enrichedItems = [];

    for (const item of items) {
      // Bloquear producto para asegurar integridad de stock global (opcional pero recomendado)
      const product = await Product.findByPk(item.product_id, { transaction, lock: true });
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);

      // Bloquear stock específico en el almacén
      const stockEntry = await ProductStock.findOne({
        where: { warehouse_id, product_id: product.id },
        transaction,
        lock: true
      });

      const currentQty = parseFloat(stockEntry?.qty || 0);
      if (currentQty < item.quantity) {
        throw new Error(`Stock insuficiente para "${product.name}" en este almacén. Disponible: ${currentQty}`);
      }

      total += parseFloat(product.price) * item.quantity;
      enrichedItems.push({ 
        product, 
        qty: item.quantity,
        stockEntry 
      });
    }

    total = parseFloat((total - discAmt).toFixed(2));
    if (total < 0) total = 0;

    const paidBase = parseFloat(paid) / rate;
    if (paidBase < total - 0.01) throw new Error("Pago insuficiente");
    const change = parseFloat((paidBase - total).toFixed(2));

    const sale = await Sale.create({
      total,
      paid: paidBase,
      change,
      customer_id: customer_id || null,
      employee_id: employee_id || null,
      currency_id: currency_id || null,
      exchange_rate: rate,
      discount_amount: discAmt,
      payment_method: method,
      payment_journal_id: payment_journal_id || null,
      warehouse_id
    }, { transaction });

    for (const entry of enrichedItems) {
      // Crear línea de venta
      await SaleItem.create({
        sale_id: sale.id,
        product_id: entry.product.id,
        name: entry.product.name,
        price: entry.product.price,
        quantity: entry.qty,
        discount: 0 // Simplificación, expandible si hay descuentos por item
      }, { transaction });

      // Descontar del almacén
      await entry.stockEntry.decrement('qty', { by: entry.qty, transaction });

      // Sincronizar stock total del producto
      const totalStock = await ProductStock.sum('qty', { 
        where: { product_id: entry.product.id }, 
        transaction 
      });
      await entry.product.update({ stock: totalStock }, { transaction });
    }

    await transaction.commit();

    // Obtener venta completa para respuesta
    const fullSale = await Sale.findByPk(sale.id, {
      include: [
        { model: Customer, attributes: ['name'] },
        { model: Employee, attributes: ['full_name'] },
        { model: Currency, attributes: ['symbol', 'code'] },
        { model: PaymentJournal, attributes: ['name', 'color'] },
        { model: Warehouse, attributes: ['name'] },
        { model: SaleItem }
      ]
    });

    const data = fullSale.toJSON();
    data.customer_name   = data.Customer?.name ?? null;
    data.employee_name   = data.Employee?.full_name ?? null;
    data.currency_symbol = data.Currency?.symbol ?? null;
    data.currency_code   = data.Currency?.code ?? null;
    data.journal_name    = data.PaymentJournal?.name ?? null;
    data.journal_color   = data.PaymentJournal?.color ?? null;
    data.warehouse_name  = data.Warehouse?.name ?? null;
    data.items = data.SaleItems ?? [];
    ['Customer','Employee','Currency','PaymentJournal','Warehouse','SaleItems'].forEach(k => delete data[k]);

    res.status(201).json({ ok: true, data });
  } catch (err) {
    if (transaction) await transaction.rollback();
    const status = /insuficiente|no encontrado/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

// DELETE /api/sales/:id
const cancel = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(req.params.id, { 
      include: [{ model: SaleItem }],
      transaction,
      lock: true 
    });
    
    if (!sale) throw new Error("Venta no encontrada");

    for (const item of sale.SaleItems) {
      if (!item.product_id) continue;
      
      // Restaurar en almacén
      const [stockEntry] = await ProductStock.findOrCreate({
        where: { warehouse_id: sale.warehouse_id, product_id: item.product_id },
        defaults: { qty: 0 },
        transaction,
        lock: true
      });
      await stockEntry.increment('qty', { by: item.quantity, transaction });

      // Sincronizar stock total de producto
      const totalStock = await ProductStock.sum('qty', { 
        where: { product_id: item.product_id }, 
        transaction 
      });
      await Product.update({ stock: totalStock }, { where: { id: item.product_id }, transaction });
    }

    await sale.destroy({ transaction });
    await transaction.commit();
    res.json({ ok: true, message: "Venta anulada y stock restaurado" });
  } catch (err) {
    if (transaction) await transaction.rollback();
    const status = /no encontrada/i.test(err.message) ? 404 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

module.exports = { getAll, getStats, create, cancel };