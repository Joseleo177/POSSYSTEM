const paymentsService = require("../services/payments");

// GET /api/payments — historial de pagos registrados
const getAll = async (req, res) => {
  try {
    const company_id = req.employee?.company_id ?? null;
    const isSuperuser = !!req.is_superuser;
    const result = await paymentsService.getAllPayments(req.query, { company_id, isSuperuser });
    res.json({ ok: true, data: result.data, total: result.total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

// GET /api/payments/pending — facturas pendientes o parciales
const getPending = async (req, res) => {
  try {
    const company_id = req.employee?.company_id ?? null;
    const isSuperuser = !!req.is_superuser;
    const result = await paymentsService.getPendingPayments(req.query, { company_id, isSuperuser });
    res.json({ ok: true, data: result.data, total: result.total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

// GET /api/payments/stats
const getStats = async (req, res) => {
  try {
    const data = await paymentsService.getPaymentsStats();
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

// POST /api/payments — registrar pago (total o parcial)
const create = async (req, res) => {
  try {
    const result = await paymentsService.createPayment({ ...req.body, employee_id: req.employee?.id || null });
    res.status(201).json({
      ok: true,
      data: result.payment,
      sale_status: result.sale_status,
      amount_paid: result.amount_paid,
      balance: result.balance,
    });
  } catch (err) {
    const status = /requerido|no encontrada|ya fue|anulada|excede|mayor/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

// DELETE /api/payments/:id — eliminar pago y recalcular status de la factura
const remove = async (req, res) => {
  try {
    const result = await paymentsService.removePayment(req.params.id);
    res.json({ ok: true, message: "Pago eliminado", sale_status: result.sale_status });
  } catch (err) {
    const status = /no encontrado|anulada/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

module.exports = { getAll, getPending, getStats, create, remove };
