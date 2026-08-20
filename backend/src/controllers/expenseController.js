const { Expense, ExpenseCategory, PaymentJournal, Employee, Currency, Warehouse, PurchasePayment } = require('../models');
const { Op } = require('sequelize');
const { recalcPurchaseStatus } = require('../services/purchasePayments/purchasePaymentService');
const { toLocalDate } = require('../utils/localDate');
const { visibleWarehouseIds, assertWarehouseAccess } = require('../middleware/auth');

// ── Listar egresos (paginado + filtros) ──────────────────────
exports.getAll = async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, date_from, date_to, search, status, category_id, warehouse_id } = req.query;
    const company_id = req.employee?.company_id ?? null;
    const isSuperuser = !!req.is_superuser;

    const where = {};
    if (!isSuperuser && company_id) where.company_id = company_id;
    if (status)      where.status = status;
    if (category_id) where.category_id = category_id;
    if (search)      where.description = { [Op.iLike]: `%${search}%` };

    // Cada quien ve los egresos de sus sucursales; el admin, los de todas.
    const allowedWarehouses = await visibleWarehouseIds(req);
    if (warehouse_id) {
      await assertWarehouseAccess(req, warehouse_id);
      where.warehouse_id = parseInt(warehouse_id);
    } else if (allowedWarehouses) {
      where.warehouse_id = { [Op.in]: allowedWarehouses };
    }

    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) where.created_at[Op.gte] = toLocalDate(date_from);
      if (date_to)   where.created_at[Op.lte] = new Date(toLocalDate(date_to).setHours(23, 59, 59, 999));
    }

    const { count, rows } = await Expense.findAndCountAll({
      where,
      include: [
        { model: ExpenseCategory, as: 'category', attributes: ['id', 'name'] },
        { model: PaymentJournal,  as: 'journal',  attributes: ['id', 'name', 'color'] },
        { model: Employee,        as: 'employee', attributes: ['id', 'full_name'] },
        { model: Currency,        as: 'currency', attributes: ['id', 'code', 'symbol'] },
        { model: Warehouse,       as: 'warehouse', attributes: ['id', 'name'], required: false },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const data = rows.map(e => ({
      id:            e.id,
      reference:     e.reference,
      description:   e.description,
      amount:        parseFloat(e.amount),
      rate:          parseFloat(e.rate || 1),
      status:        e.status,
      notes:         e.notes,
      date:          e.date ?? null,
      created_at:    e.created_at,
      category_name: e.category?.name || '',
      category_id:   e.category_id,
      journal_name:  e.journal?.name  || '',
      journal_color: e.journal?.color || null,
      journal_id:    e.payment_journal_id,
      employee_name: e.employee?.full_name || '',
      currency_code: e.currency?.code || '',
      currency_symbol: e.currency?.symbol || '',
      warehouse_id:   e.warehouse_id,
      warehouse_name: e.warehouse?.name || '',
    }));

    res.json({ ok: true, data, total: count });
  } catch (err) { next(err); }
};

// ── Listar categorías ────────────────────────────────────────
exports.getCategories = async (req, res, next) => {
  try {
    const cats = await ExpenseCategory.findAll({ where: { active: true }, order: [['name', 'ASC']] });
    res.json({ ok: true, data: cats });
  } catch (err) { next(err); }
};

// ── Crear / Editar categoría ─────────────────────────────────
exports.upsertCategory = async (req, res, next) => {
  try {
    const { id, name, active } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: 'Nombre requerido' });

    let cat;
    if (id) {
      cat = await ExpenseCategory.findByPk(id);
      if (!cat) return res.status(404).json({ ok: false, message: 'Categoría no encontrada' });
      await cat.update({ name, active: active !== undefined ? active : cat.active });
    } else {
      cat = await ExpenseCategory.create({ name, active: true });
    }
    res.json({ ok: true, data: cat });
  } catch (err) { next(err); }
};

// ── Crear egreso ─────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    const { description, amount, category_id, payment_journal_id, reference, notes, currency_id, rate, date, warehouse_id } = req.body;

    if (!description || !amount || !category_id) {
      return res.status(400).json({ ok: false, message: 'Descripción, monto y categoría son obligatorios' });
    }
    if (!warehouse_id) {
      return res.status(400).json({ ok: false, message: 'Debes indicar el almacén al que corresponde el egreso' });
    }
    // Solo se puede cargar un gasto a una sucursal propia.
    await assertWarehouseAccess(req, warehouse_id);
    // Y contra un almacén que atienda público: un depósito no maneja caja.
    const almacenMov = await Warehouse.findByPk(warehouse_id, { attributes: ['id', 'name', 'sells'] });
    if (almacenMov && almacenMov.sells === false) {
      return res.status(400).json({ ok: false, message: `${almacenMov.name} es un depósito: los movimientos se registran en un punto de venta` });
    }

    const expense = await Expense.create({
      description,
      amount,
      category_id,
      payment_journal_id: payment_journal_id || null,
      reference: reference || null,
      notes: notes || null,
      currency_id: currency_id || null,
      rate: rate || 1,
      employee_id: req.employee.id,
      warehouse_id: parseInt(warehouse_id),
      status: 'activo',
      date: toLocalDate(date),
    });

    // Reload con asociaciones
    const full = await Expense.findByPk(expense.id, {
      include: [
        { model: ExpenseCategory, as: 'category', attributes: ['id', 'name'] },
        { model: PaymentJournal,  as: 'journal',  attributes: ['id', 'name', 'color'] },
        { model: Employee,        as: 'employee', attributes: ['id', 'full_name'] },
      ],
    });

    res.status(201).json({ ok: true, data: full });
  } catch (err) { next(err); }
};

// ── Eliminar egreso (solo si está anulado) ───────────────────
exports.deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findByPk(req.params.id);
    if (!expense) return res.status(404).json({ ok: false, message: 'Egreso no encontrado' });
    await assertWarehouseAccess(req, expense.warehouse_id, { optional: true });
    if (expense.status !== 'anulado') return res.status(400).json({ ok: false, message: 'Solo se pueden eliminar egresos anulados' });
    await expense.destroy();
    res.json({ ok: true, message: 'Egreso eliminado permanentemente' });
  } catch (err) { next(err); }
};

// ── Anular egreso ────────────────────────────────────────────
exports.voidExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findByPk(req.params.id);
    if (!expense) return res.status(404).json({ ok: false, message: 'Egreso no encontrado' });
    await assertWarehouseAccess(req, expense.warehouse_id, { optional: true });
    if (expense.status === 'anulado') return res.status(400).json({ ok: false, message: 'Ya está anulado' });

    await expense.update({ status: 'anulado' });

    // Si el egreso proviene de un pago a proveedor, recalcular el estado de la compra
    if (expense.reference?.startsWith('purchase_payment:')) {
      const paymentId = parseInt(expense.reference.split(':')[1]);
      const payment = await PurchasePayment.findByPk(paymentId);
      if (payment) await recalcPurchaseStatus(payment.purchase_id);
    }

    res.json({ ok: true, message: 'Egreso anulado' });
  } catch (err) { next(err); }
};
