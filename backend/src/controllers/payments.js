const { Payment, Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Sequelize, sequelize } = require("../models");
const { Op } = Sequelize;

// Calcula monto pagado y balance de una venta (en moneda base)
async function getSaleBalance(saleId, transaction) {
  const paid = parseFloat(await Payment.sum('amount', { where: { sale_id: saleId }, transaction }) || 0);
  return paid;
}

// GET /api/payments — historial de pagos registrados
const getAll = async (req, res) => {
  try {
    const { date_from, date_to, limit = 100, offset = 0 } = req.query;
    const where = {};
    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) where.created_at[Op.gte] = date_from;
      if (date_to)   where.created_at[Op.lt]  = Sequelize.literal(`('${date_to}'::date + INTERVAL '1 day')`);
    }

    const { count, rows } = await Payment.findAndCountAll({
      where,
      limit: parseInt(limit), offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        { model: Customer,       attributes: ['name', 'rif'],    required: false },
        { model: Employee,       attributes: ['full_name'],       required: false },
        { model: Currency,       attributes: ['symbol', 'code'],  required: false },
        { model: PaymentJournal, attributes: ['name', 'color'],   required: false },
        {
          model: Sale,
          attributes: ['id', 'total', 'status', 'exchange_rate', 'currency_id', 'created_at', 'invoice_number'],
          required: true,
          include: [{ model: SaleItem, attributes: ['name', 'quantity', 'price', 'subtotal'] }],
        },
      ],
    });

    const data = rows.map(p => {
      const item = p.toJSON();
      item.customer_name   = item.Customer?.name      ?? null;
      item.customer_rif    = item.Customer?.rif       ?? null;
      item.employee_name   = item.Employee?.full_name ?? null;
      item.currency_symbol = item.Currency?.symbol    ?? null;
      item.currency_code   = item.Currency?.code      ?? null;
      item.journal_name    = item.PaymentJournal?.name  ?? null;
      item.journal_color   = item.PaymentJournal?.color ?? null;
      item.sale_total          = item.Sale?.total          ?? null;
      item.sale_status         = item.Sale?.status         ?? null;
      item.sale_items          = item.Sale?.SaleItems      ?? [];
      item.invoice_number      = item.Sale?.invoice_number ?? null;
      ['Customer','Employee','Currency','PaymentJournal'].forEach(k => delete item[k]);
      if (item.Sale) delete item.Sale.SaleItems;
      return item;
    });

    res.json({ ok: true, data, total: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

// GET /api/payments/pending — facturas pendientes o parciales
const getPending = async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const { count, rows: sales } = await Sale.findAndCountAll({
      where: { status: { [Op.in]: ['pendiente', 'parcial'] } },
      limit: parseInt(limit), offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        { model: Customer,       attributes: ['name', 'rif'],    required: false },
        { model: Employee,       attributes: ['full_name'],       required: false },
        { model: Currency,       attributes: ['symbol', 'code'],  required: false },
        { model: PaymentJournal, attributes: ['name', 'color'],   required: false },
        { model: SaleItem, required: true },
      ],
      distinct: true,
    });

    // Para cada venta, calcular monto pagado y balance
    const data = await Promise.all(sales.map(async s => {
      const item        = s.toJSON();
      const amount_paid = parseFloat(await Payment.sum('amount', { where: { sale_id: s.id } }) || 0);
      const balance     = parseFloat((parseFloat(item.total) - amount_paid).toFixed(2));

      item.customer_name  = item.Customer?.name      ?? null;
      item.customer_rif   = item.Customer?.rif       ?? null;
      item.employee_name  = item.Employee?.full_name ?? null;
      item.currency_code  = item.Currency?.code      ?? null;
      item.currency_symbol= item.Currency?.symbol    ?? null;
      item.journal_name   = item.PaymentJournal?.name  ?? null;
      item.journal_color  = item.PaymentJournal?.color ?? null;
      item.items          = item.SaleItems ?? [];
      item.amount_paid    = amount_paid;
      item.balance        = balance;
      ['Customer','Employee','Currency','PaymentJournal','SaleItems'].forEach(k => delete item[k]);
      return item;
    }));

    res.json({ ok: true, data, total: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

// GET /api/payments/stats
const getStats = async (req, res) => {
  try {
    const [pendingCount, parcialCount, paidCount, paymentStats] = await Promise.all([
      Sale.count({ where: { status: 'pendiente' } }),
      Sale.count({ where: { status: 'parcial'   } }),
      Sale.count({ where: { status: 'pagado'    } }),
      Payment.findOne({
        attributes: [
          [Sequelize.fn('COUNT', Sequelize.col('id')),     'total_payments'],
          [Sequelize.fn('SUM',   Sequelize.col('amount')), 'total_amount'],
          [Sequelize.literal(`COUNT(CASE WHEN "Payment"."created_at" >= CURRENT_DATE THEN 1 END)`), 'payments_today'],
          [Sequelize.literal(`COALESCE(SUM(CASE WHEN "Payment"."created_at" >= CURRENT_DATE THEN amount ELSE 0 END), 0)`), 'amount_today'],
        ],
        raw: true,
      }),
    ]);

    res.json({ ok: true, data: {
      pending_invoices: pendingCount,
      parcial_invoices: parcialCount,
      paid_invoices:    paidCount,
      total_payments:   parseInt(paymentStats?.total_payments || 0),
      total_amount:     parseFloat(paymentStats?.total_amount || 0),
      payments_today:   parseInt(paymentStats?.payments_today || 0),
      amount_today:     parseFloat(paymentStats?.amount_today || 0),
    }});
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

// POST /api/payments — registrar pago (total o parcial)
const create = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { sale_id, amount, currency_id, exchange_rate, payment_journal_id, employee_id, reference_date, reference_number, notes } = req.body;

    if (!sale_id)       throw new Error("sale_id es requerido");
    if (!amount)        throw new Error("El monto es requerido");
    if (!reference_date) throw new Error("La fecha de referencia es requerida");

    const sale = await Sale.findByPk(sale_id, { transaction: t, lock: true });
    if (!sale)                     throw new Error("Factura no encontrada");
    if (sale.status === 'pagado')  throw new Error("Esta factura ya fue pagada");
    if (sale.status === 'anulado') throw new Error("Esta factura está anulada");

    const payAmt = parseFloat(amount);
    if (payAmt <= 0) throw new Error("El monto debe ser mayor a 0");

    // Calcular total ya pagado (en moneda base)
    const alreadyPaid = await getSaleBalance(sale_id, t);
    const totalPaidNow = parseFloat((alreadyPaid + payAmt).toFixed(2));
    const saleTotal    = parseFloat(sale.total);

    if (totalPaidNow > saleTotal + 0.001) throw new Error(`El monto excede el saldo pendiente. Saldo: ${(saleTotal - alreadyPaid).toFixed(2)}`);

    const payment = await Payment.create({
      sale_id,
      customer_id:        sale.customer_id,
      amount:             payAmt,
      currency_id:        currency_id || sale.currency_id || null,
      exchange_rate:      parseFloat(exchange_rate) || sale.exchange_rate || 1,
      payment_journal_id: payment_journal_id || sale.payment_journal_id || null,
      employee_id:        employee_id || null,
      reference_date:     reference_date,
      reference_number:   reference_number?.trim() || null,
      notes:              notes?.trim() || null,
    }, { transaction: t });

    // Determinar nuevo status — tolerancia mínima solo para float precision
    const newStatus = totalPaidNow >= saleTotal - 0.001 ? 'pagado' : 'parcial';
    await sale.update({ status: newStatus }, { transaction: t });

    await t.commit();

    const balance = parseFloat((saleTotal - totalPaidNow).toFixed(2));
    res.status(201).json({
      ok: true,
      data: payment,
      sale_status:  newStatus,
      amount_paid:  totalPaidNow,
      balance:      balance < 0 ? 0 : balance,
    });
  } catch (err) {
    await t.rollback();
    const status = /requerido|no encontrada|ya fue|anulada|excede|mayor/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

// DELETE /api/payments/:id — eliminar pago y recalcular status de la factura
const remove = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const payment = await Payment.findByPk(req.params.id, { transaction: t, lock: true });
    if (!payment) throw new Error("Pago no encontrado");

    const sale = await Sale.findByPk(payment.sale_id, { transaction: t, lock: true });
    if (!sale) throw new Error("Factura no encontrada");
    if (sale.status === 'anulado') throw new Error("La factura está anulada");

    await payment.destroy({ transaction: t });

    // Recalcular status de la factura
    const remainingPaid = parseFloat(await Payment.sum('amount', { where: { sale_id: sale.id }, transaction: t }) || 0);
    const saleTotal     = parseFloat(sale.total);
    let newStatus;
    if (remainingPaid <= 0)                    newStatus = 'pendiente';
    else if (remainingPaid >= saleTotal - 0.01) newStatus = 'pagado';
    else                                        newStatus = 'parcial';

    await sale.update({ status: newStatus }, { transaction: t });
    await t.commit();

    res.json({ ok: true, message: "Pago eliminado", sale_status: newStatus });
  } catch (err) {
    await t.rollback();
    const status = /no encontrado|anulada/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

module.exports = { getAll, getPending, getStats, create, remove };
