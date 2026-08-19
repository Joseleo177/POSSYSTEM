const salesService = require("../services/sales");
const { broadcast } = require("../services/sseService");
const { visibleWarehouseIds, assertWarehouseAccess } = require("../middleware/auth");

// PATCH /api/sales/:id
const update = async (req, res) => {
  try {
    const data = await salesService.updateSale(req.params.id, req.body);
    // Editar una cuenta en espera devuelve y vuelve a apartar inventario, igual que crearla
    // o anularla. Sin este aviso las otras cajas seguían mostrando el stock viejo hasta que
    // el cajero refrescaba a mano: era el único endpoint que movía existencias en silencio.
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    res.json({ ok: true, data });
  } catch (err) {
    const status = err.status || (/insuficiente|no encontrad/i.test(err.message) ? 400 : 500);
    // `code` viaja hasta la caja: con él distingue "otra caja tocó esta cuenta" de un error
    // corriente y puede rehacer el carrito como venta nueva en vez de dejarlo atascado.
    res.status(status).json({ ok: false, message: err.message, code: err.code });
  }
};

// POST /api/sales/:id/accept-order
// Acepta un pedido llegado del catálogo público: descuenta inventario y lo deja como
// cuenta en espera. El almacén sale del que tenga activo quien lo acepta.
const acceptOrder = async (req, res) => {
  try {
    const data = await salesService.acceptWebOrder(req.params.id, {
      warehouse_id: req.body?.warehouse_id,
      serie_id: req.body?.serie_id,
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
    // El listado se limita a las sucursales del empleado; el admin las ve todas.
    if (req.query.warehouse_id) await assertWarehouseAccess(req, req.query.warehouse_id);
    const allowedWarehouses = await visibleWarehouseIds(req);
    const result = await salesService.getAllSales(req.query, { company_id, isSuperuser, allowedWarehouses });
    // Solo el listado de cuentas en espera necesita saber quién tiene cada una; en el
    // historial de facturas el dato no aplica y sería una consulta de más por página.
    const wantsHeld = [].concat(req.query.status || []).some(s => s === "espera" || s === "pedido");
    const data = wantsHeld
      ? await salesService.annotateHolders(result.data, req.employee?.id ?? null)
      : result.data;
    // sum_total / sum_paid: totales del filtro completo en moneda base, para el sumador al pie.
    res.json({ ok: true, data, total: result.total, sum_total: result.sum_total, sum_paid: result.sum_paid, sum_pending: result.sum_pending });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener ventas" });
  }
};

// POST /api/sales/:id/claim — la caja toma la cuenta para atenderla
const claim = async (req, res) => {
  try {
    await salesService.claimSale(req.params.id, req.employee?.id ?? null);
    // Las demás cajas deben ver el candado al instante, no en su próxima recarga.
    broadcast(req.employee?.company_id ?? 0, 'sales:updated', {});
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message, code: err.code });
  }
};

// DELETE /api/sales/:id/claim — la suelta. Un administrador puede soltar la de cualquiera.
const release = async (req, res) => {
  try {
    const force = !!req.employee?.permissions?.all;
    const data = await salesService.releaseSale(req.params.id, req.employee?.id ?? null, { force });
    broadcast(req.employee?.company_id ?? 0, 'sales:updated', {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message, code: err.code });
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

module.exports = { getOne, getAll, getStats, create, cancel, update, confirmCredit, acceptOrder, claim, release };