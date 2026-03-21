const {
  Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Warehouse, Product, ProductStock, Serie, SerieRange, ProductComboItem, Sequelize, sequelize
} = require("../models");
const { Op } = Sequelize;

const PAYMENT_METHODS = ["efectivo", "transferencia", "pago_movil", "zelle", "punto_venta"];

// GET /api/sales
const getAll = async (req, res) => {
  try {
    const { limit = 50, offset = 0, date_from, date_to, payment_method, status, serie_id } = req.query;

    const where = {};
    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) where.created_at[Op.gte] = date_from;
      if (date_to)   where.created_at[Op.lt]  = Sequelize.literal(`('${date_to}'::date + INTERVAL '1 day')`);
    }
    if (payment_method && PAYMENT_METHODS.includes(payment_method)) where.payment_method = payment_method;
    if (status)   where.status   = status;
    if (serie_id) where.serie_id = parseInt(serie_id);

    const { count, rows: sales } = await Sale.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      attributes: {
        include: [
          [Sequelize.literal(`(SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = "Sale"."id")`), 'amount_paid'],
          [Sequelize.literal(`(SELECT exchange_rate FROM payments WHERE sale_id = "Sale"."id" ORDER BY created_at DESC LIMIT 1)`), 'final_payment_rate'],
        ]
      },
      include: [
        { model: Customer,  attributes: ['name'],         required: false },
        { model: Employee,  attributes: ['full_name'],    required: false },
        { model: Currency,  attributes: ['symbol','code'],required: false },
        { model: Warehouse, attributes: ['name'],         required: false },
        { model: Serie,     attributes: ['name','prefix'],required: false },
        { model: SaleItem,  required: true },
      ],
      distinct: true
    });

    const data = sales.map(s => {
      const item = s.toJSON();
      item.customer_name   = item.Customer?.name      ?? null;
      item.employee_name   = item.Employee?.full_name ?? null;
      item.currency_symbol = item.Currency?.symbol    ?? null;
      item.currency_code   = item.Currency?.code      ?? null;
      item.warehouse_name  = item.Warehouse?.name     ?? null;
      item.serie_name      = item.Serie?.name         ?? null;
      item.items           = item.SaleItems ?? [];
      item.amount_paid     = parseFloat(item.amount_paid || 0);
      item.balance         = parseFloat((parseFloat(item.total) - item.amount_paid).toFixed(2));
      ['Customer','Employee','Currency','Warehouse','Serie','SaleItems'].forEach(k => delete item[k]);
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
      exchange_rate, payment_method, serie_id,
      discount_amount, warehouse_id,
    } = req.body;

    if (!items?.length) throw new Error("items es requerido");
    if (paid == null)   throw new Error("paid es requerido");
    if (!warehouse_id)  throw new Error("warehouse_id es requerido");
    if (!serie_id)      throw new Error("La serie es requerida");

    // Obtener rango activo de la serie (con bloqueo para evitar duplicados)
    const serie = await Serie.findByPk(serie_id, { transaction });
    if (!serie || !serie.active) throw new Error("Serie no encontrada o inactiva");

    const activeRange = await SerieRange.findOne({
      where: {
        serie_id,
        active: true,
        current_number: { [Sequelize.Op.lte]: Sequelize.col('end_number') },
      },
      order: [['start_number', 'ASC']],
      lock: true,
      transaction,
    });
    if (!activeRange) throw new Error(`Serie "${serie.name}" agotada. Añade un nuevo rango en Contabilidad.`);

    const correlativeNumber = activeRange.current_number;
    const paddedNumber      = String(correlativeNumber).padStart(serie.padding, '0');
    const invoiceNumber     = `${serie.prefix}-${paddedNumber}`;

    // Avanzar correlativo
    const nextNumber = correlativeNumber + 1;
    if (nextNumber > activeRange.end_number) {
      await activeRange.update({ current_number: nextNumber, active: false }, { transaction });
    } else {
      await activeRange.update({ current_number: nextNumber }, { transaction });
    }

    const method = PAYMENT_METHODS.includes(payment_method) ? payment_method : "efectivo";

    const discAmt   = parseFloat(discount_amount) || 0;
    const rate      = parseFloat(exchange_rate)   || 1;

    let total = 0;
    const enrichedItems = [];

    for (const item of items) {
      // Bloquear producto para asegurar integridad de stock global (opcional pero recomendado)
      const product = await Product.findByPk(item.product_id, { transaction, lock: true });
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);

      if (product.is_combo) {
        const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
        if (!comboItems || comboItems.length === 0) {
          throw new Error(`El combo "${product.name}" no tiene ingredientes configurados`);
        }

        const ingredientsData = [];
        for (const cItem of comboItems) {
          const ingredient = await Product.findByPk(cItem.product_id, { transaction, lock: true });
          const qtyNeeded = item.quantity * parseFloat(cItem.quantity);
          
          const stockEntry = await ProductStock.findOne({
            where: { warehouse_id, product_id: ingredient.id },
            transaction,
            lock: true
          });
          const currentQty = parseFloat(stockEntry?.qty || 0);
          if (currentQty < qtyNeeded) {
            throw new Error(`Stock insuficiente del ingrediente "${ingredient.name}" para el combo "${product.name}". Disponible: ${currentQty}, Requerido: ${qtyNeeded}`);
          }
          ingredientsData.push({ ingredient, qtyNeeded, stockEntry });
        }

        total += parseFloat(product.price) * item.quantity;
        enrichedItems.push({
          product,
          qty: item.quantity,
          isCombo: true,
          ingredientsData
        });
      } else {
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
          isCombo: false,
          stockEntry 
        });
      }
    }

    total = parseFloat((total - discAmt).toFixed(2));
    if (total < 0) total = 0;

    const paidBase = parseFloat(paid) || 0;
    const change   = 0;

    const sale = await Sale.create({
      total,
      paid:               paidBase,
      change,
      customer_id:        customer_id || null,
      employee_id:        employee_id || null,
      currency_id:        currency_id || null,
      exchange_rate:      rate,
      discount_amount:    discAmt,
      payment_method:     method,
      warehouse_id,
      serie_id:           serie.id,
      serie_range_id:     activeRange.id,
      correlative_number: correlativeNumber,
      invoice_number:     invoiceNumber,
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

      if (entry.isCombo) {
        // Descontar del almacén por ingrediente
        for (const ing of entry.ingredientsData) {
          await ing.stockEntry.decrement('qty', { by: ing.qtyNeeded, transaction });
          const totalStock = await ProductStock.sum('qty', { 
            where: { product_id: ing.ingredient.id }, 
            transaction 
          });
          await ing.ingredient.update({ stock: totalStock || 0 }, { transaction });
        }
      } else {
        // Descontar del almacén directo
        await entry.stockEntry.decrement('qty', { by: entry.qty, transaction });

        // Sincronizar stock total del producto
        const totalStock = await ProductStock.sum('qty', { 
          where: { product_id: entry.product.id }, 
          transaction 
        });
        await entry.product.update({ stock: totalStock || 0 }, { transaction });
      }
    }

    await transaction.commit();

    // Obtener venta completa para respuesta
    const fullSale = await Sale.findByPk(sale.id, {
      include: [
        { model: Customer,  attributes: ['name'] },
        { model: Employee,  attributes: ['full_name'] },
        { model: Currency,  attributes: ['symbol', 'code'] },
        { model: Warehouse, attributes: ['name'] },
        { model: Serie,     attributes: ['name', 'prefix', 'padding'] },
        { model: SaleItem },
      ]
    });

    const data = fullSale.toJSON();
    data.customer_name   = data.Customer?.name         ?? null;
    data.employee_name   = data.Employee?.full_name    ?? null;
    data.currency_symbol = data.Currency?.symbol       ?? null;
    data.currency_code   = data.Currency?.code         ?? null;
    data.warehouse_name  = data.Warehouse?.name        ?? null;
    data.serie_name      = data.Serie?.name            ?? null;
    data.items = data.SaleItems ?? [];
    ['Customer','Employee','Currency','Warehouse','Serie','SaleItems'].forEach(k => delete data[k]);

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
    // 1. Bloquear la venta (sin include para evitar error de PostgreSQL con outer join + FOR UPDATE)
    const sale = await Sale.findByPk(req.params.id, { 
      transaction, 
      lock: true 
    });
    
    if (!sale) throw new Error("Venta no encontrada");

    // 2. Cargar los ítems por separado
    const items = await SaleItem.findAll({
      where: { sale_id: sale.id },
      transaction
    });

    for (const item of items) {
      if (!item.product_id) continue;
      
      const product = await Product.findByPk(item.product_id, { transaction });
      
      if (product && product.is_combo) {
        const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
        for (const cItem of comboItems) {
          const qtyToRestore = item.quantity * parseFloat(cItem.quantity);
          const [stockEntry] = await ProductStock.findOrCreate({
            where: { warehouse_id: sale.warehouse_id, product_id: cItem.product_id },
            defaults: { qty: 0 },
            transaction,
            lock: true
          });
          await stockEntry.increment('qty', { by: qtyToRestore, transaction });

          const totalStock = await ProductStock.sum('qty', { 
            where: { product_id: cItem.product_id }, 
            transaction 
          });
          await Product.update({ stock: totalStock || 0 }, { where: { id: cItem.product_id }, transaction });
        }
      } else {
        // Restaurar en almacén directo
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
        await Product.update({ stock: totalStock || 0 }, { where: { id: item.product_id }, transaction });
      }
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