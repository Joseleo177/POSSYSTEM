const salesService = require("../services/sales");
const { broadcast } = require("../services/sseService");

// PATCH /api/sales/:id
const update = async (req, res) => {
  try {
    const data = await salesService.updateSale(req.params.id, req.body);
    res.json({ ok: true, data });
  } catch (err) {
    const status = err.status || (/insuficiente|no encontrad/i.test(err.message) ? 400 : 500);
    res.status(status).json({ ok: false, message: err.message });
  }
};

// POST /api/sales/:id/accept-order
// Acepta un pedido llegado del catálogo público: descuenta inventario y lo deja como
// cuenta en espera. El almacén sale del que tenga activo quien lo acepta.
const acceptOrder = async (req, res) => {
  try {
    const data = await salesService.acceptWebOrder(req.params.id, {
      warehouse_id: req.body?.warehouse_id,
      employee_id: req.employee?.id ?? null,
    });
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    res.json({ ok: true, data });
  } catch (err) {
    const status = err.status || (/insuficiente|no encontrad/i.test(err.message) ? 400 : 500);
    res.status(status).json({ ok: false, message: err.message });
  }
};

// GET /api/sales/:id
const getOne = async (req, res) => {
  try {
    const data = await salesService.getOneSale(req.params.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// GET /api/sales
const getAll = async (req, res) => {
  try {
    const company_id = req.employee?.company_id ?? null;
    const isSuperuser = !!req.is_superuser;
    const result = await salesService.getAllSales(req.query, { company_id, isSuperuser });
    res.json({ ok: true, data: result.data, total: result.total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener ventas" });
  }
};

// GET /api/sales/stats
const getStats = async (req, res) => {
  try {
    const data = await salesService.getSalesStats(req.query);
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener estadísticas" });
  }
};

// POST /api/sales
const create = async (req, res) => {
  try {
    const data = await salesService.createSale(req.body);
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    const status = /insuficiente|no encontrado/i.test(err.message) ? 400 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

// DELETE /api/sales/:id
const cancel = async (req, res) => {
  try {
    await salesService.cancelSale(req.params.id);
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    res.json({ ok: true, message: "Venta anulada y stock restaurado" });
  } catch (err) {
    const status = /no encontrada/i.test(err.message) ? 404 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

// POST /api/sales/:id/credit — entrega a crédito: asigna correlativo y deja por cobrar
const confirmCredit = async (req, res) => {
  try {
    const result = await salesService.confirmCreditSale(req.params.id);
    broadcast(req.employee?.company_id ?? 0, 'sales:updated', {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

module.exports = { getOne, getAll, getStats, create, cancel, update, confirmCredit, acceptOrder };