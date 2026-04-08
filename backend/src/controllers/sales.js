const salesService = require("../services/sales");

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
    const result = await salesService.getAllSales(req.query);
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
    res.json({ ok: true, message: "Venta anulada y stock restaurado" });
  } catch (err) {
    const status = /no encontrada/i.test(err.message) ? 404 : 500;
    res.status(status).json({ ok: false, message: err.message });
  }
};

module.exports = { getOne, getAll, getStats, create, cancel };