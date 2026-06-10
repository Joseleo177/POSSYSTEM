const {
  StockSession, StockSessionLine, ProductStock, Product, Employee, sequelize
} = require('../../models');

function _sessionData(session) {
  const d = session.toJSON();
  d.employee_name = d.Employee?.full_name ?? null;
  d.line_count    = (d.lines || []).length;
  delete d.Employee;
  return d;
}

const SESSION_INCLUDE = [
  { model: Employee,          attributes: ['full_name'], required: false },
  { model: StockSessionLine,  as: 'lines',               required: false, order: [['created_at', 'ASC']] },
];

async function getActiveSession(warehouseId, req) {
  const companyId = req.employee?.company_id ?? null;
  const where = { warehouse_id: parseInt(warehouseId), status: 'open' };
  if (companyId) where.company_id = companyId;

  const session = await StockSession.findOne({ where, include: SESSION_INCLUDE, order: [['opened_at', 'DESC']] });
  return { data: session ? _sessionData(session) : null };
}

async function openSession(warehouseId, req) {
  const companyId  = req.employee?.company_id ?? null;
  const employeeId = req.employee?.id         ?? null;
  const where = { warehouse_id: parseInt(warehouseId), status: 'open' };
  if (companyId) where.company_id = companyId;

  const existing = await StockSession.findOne({ where, include: SESSION_INCLUDE });
  if (existing) return { data: _sessionData(existing) };

  const session = await StockSession.create({
    warehouse_id: parseInt(warehouseId),
    employee_id:  employeeId,
    company_id:   companyId,
    status:       'open',
    opened_at:    new Date(),
  });

  const full = await StockSession.findByPk(session.id, { include: SESSION_INCLUDE });
  return { data: _sessionData(full) };
}

async function addLine(warehouseId, sessionId, { product_id, qty, type, reason, notes }, req) {
  const companyId = req.employee?.company_id ?? null;
  const where = { id: parseInt(sessionId), warehouse_id: parseInt(warehouseId), status: 'open' };
  if (companyId) where.company_id = companyId;

  const session = await StockSession.findOne({ where });
  if (!session) { const e = new Error('Sesión no encontrada o ya cerrada'); e.status = 404; throw e; }

  const parsedQty = Math.abs(parseFloat(qty));
  if (!parsedQty) { const e = new Error('Cantidad inválida'); e.status = 400; throw e; }
  const finalQty = type === 'out' ? -parsedQty : parsedQty;

  const transaction = await sequelize.transaction();
  try {
    const product = await Product.findByPk(product_id, { transaction, lock: true });
    if (!product) { const e = new Error('Producto no encontrado'); e.status = 404; throw e; }
    if (product.is_combo) { const e = new Error('Los combos no admiten ajuste manual: su stock se calcula de los ingredientes'); e.status = 400; throw e; }
    if (product.is_service) { const e = new Error('Los servicios no manejan stock'); e.status = 400; throw e; }

    const [stockEntry] = await ProductStock.findOrCreate({
      where:    { warehouse_id: parseInt(warehouseId), product_id },
      defaults: { qty: 0 },
      transaction, lock: true,
    });

    const qtyBefore = parseFloat(stockEntry.qty || 0);
    if (finalQty < 0 && qtyBefore + finalQty < 0) {
      const e = new Error(`Stock insuficiente. Disponible: ${qtyBefore}`); e.status = 400; throw e;
    }

    await stockEntry.increment('qty', { by: finalQty, transaction });
    const qtyAfter = parseFloat((qtyBefore + finalQty).toFixed(4));

    const totalStock = await ProductStock.sum('qty', { where: { product_id }, transaction });
    await product.update({ stock: totalStock || 0 }, { transaction });

    const line = await StockSessionLine.create({
      session_id:   session.id,
      warehouse_id: parseInt(warehouseId),
      product_id,
      product_name: product.name,
      qty_before:   qtyBefore,
      qty_adjusted: finalQty,
      qty_after:    qtyAfter,
      type,
      reason:       reason || null,
      notes:        notes  || null,
    }, { transaction });

    await transaction.commit();
    return { data: line.toJSON() };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function closeSession(warehouseId, sessionId, { notes } = {}, req) {
  const companyId = req.employee?.company_id ?? null;
  const where = { id: parseInt(sessionId), warehouse_id: parseInt(warehouseId), status: 'open' };
  if (companyId) where.company_id = companyId;

  const session = await StockSession.findOne({ where });
  if (!session) { const e = new Error('Sesión no encontrada o ya cerrada'); e.status = 404; throw e; }

  await session.update({ status: 'closed', closed_at: new Date(), notes: notes || session.notes });

  const full = await StockSession.findByPk(session.id, { include: SESSION_INCLUDE });
  return { data: _sessionData(full) };
}

async function getSessions(warehouseId, { limit = 30, offset = 0 } = {}, req) {
  const companyId = req.employee?.company_id ?? null;
  const where = { warehouse_id: parseInt(warehouseId) };
  if (companyId) where.company_id = companyId;

  const rows = await StockSession.findAll({
    where,
    include: SESSION_INCLUDE,
    order:  [['opened_at', 'DESC']],
    limit:  parseInt(limit),
    offset: parseInt(offset),
  });

  return { data: rows.map(_sessionData) };
}

module.exports = { getActiveSession, openSession, addLine, closeSession, getSessions };
