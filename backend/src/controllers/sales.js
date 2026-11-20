const salesService = require("../services/sales");
const { broadcast } = require("../services/sseService");
const { scopeWarehouseIds, assertWarehouseAccess } = require("../middleware/auth");
const { getReceivables, setSaleDueDate } = require("../services/sales/receivables");
const { saveImage, imageUrl } = require("../utils/imageStorage");

// PATCH /api/sales/:id
const update = async (req, res) => {
  try {
    const data = await salesService.updateSale(req.params.id, req.body, req);
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
    const data = await salesService.getOneSale(req.params.id, req);
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
    const allowedWarehouses = await scopeWarehouseIds(req);
    const result = await salesService.getAllSales(req.query, { company_id, isSuperuser, allowedWarehouses });
    // Solo el listado de cuentas en espera necesita saber quién tiene cada una; en el
    // historial de facturas el dato no aplica y sería una consulta de más por página.
    const wantsHeld = [].concat(req.query.status || []).some(s => s === "espera" || s === "pedido");
    const data = wantsHeld
      ? await salesService.annotateHolders(result.data, req.employee?.id ?? null)
      : result.data;
    // sum_total / sum_paid: totales del filtro completo en moneda base, para el sumador al pie.
    res.json({
      ok: true, data, total: result.total,
      sum_total: result.sum_total, sum_paid: result.sum_paid,
      sum_pending: result.sum_pending, sum_forgiven: result.sum_forgiven,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener ventas" });
  }
};

// POST /api/sales/:id/claim — la caja toma la cuenta para atenderla
const claim = async (req, res) => {
  try {
    await salesService.claimSale(req.params.id, req.employee?.id ?? null, req);
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
    const data = await salesService.releaseSale(req.params.id, req.employee?.id ?? null, { force }, req);
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
    const data = await salesService.createSale(req.body, req);
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    // Los rechazos con código propio (permiso, tope, tasa de divisas) lo conservan: un 500 lo
    // lee la caja como servidor caído, no como "no se puede".
    const status = err.status || (/insuficiente|no encontrado/i.test(err.message) ? 400 : 500);
    res.status(status).json({ ok: false, message: err.message });
  }
};

// POST /api/sales/offline — venta hecha sin conexión, enviada desde la cola de la caja
const syncOffline = async (req, res) => {
  try {
    const data = await salesService.syncOfflineSale(req.body, req);
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    // `retry: false` le dice a la caja que reintentar no va a cambiar nada (un dato de la
    // venta que el servidor no acepta): la pasa a su bandeja en vez de insistir.
    const status = err.status || (/inválid|no encontrad|requerid|no existe|depósito|serie/i.test(err.message) ? 400 : 500);
    res.status(status).json({ ok: false, message: err.message, retry: status >= 500 });
  }
};

// DELETE /api/sales/:id
const cancel = async (req, res) => {
  try {
    await salesService.cancelSale(req.params.id, req);
    broadcast(req.employee?.company_id ?? 0, 'products:updated', {});
    res.json({ ok: true, message: "Venta anulada y stock restaurado" });
  } catch (err) {
    const status = /no encontrada/i.test(err.message) ? 404 : (err.status || 500);
    res.status(status).json({ ok: false, message: err.message });
  }
};

// POST /api/sales/:id/credit — entrega a crédito: asigna correlativo y deja por cobrar
const confirmCredit = async (req, res) => {
  try {
    const result = await salesService.confirmCreditSale(req.params.id, req);
    broadcast(req.employee?.company_id ?? 0, 'sales:updated', {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// DELETE /api/sales/:id/fx-rate — quita la tasa de divisas a una venta de contado aún sin cobrar
const removeFxRate = async (req, res) => {
  try {
    const data = await salesService.removeFxRate(req.params.id, req);
    broadcast(req.employee?.company_id ?? 0, 'sales:updated', {});
    res.json({ ok: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// POST /api/sales/:id/forgive — perdona el saldo pendiente y cierra la factura
const forgive = async (req, res) => {
  try {
    const result = await salesService.forgiveSale(req.params.id, {
      reason: req.body?.reason,
      // Tasa del día con que la pantalla calculó el saldo en Bs (ver forgiveSale).
      rate: req.body?.rate,
      employee_id: req.employee?.id ?? null,
    }, req);
    // Las demás cajas deben ver la factura fuera de cuentas por cobrar sin recargar a mano.
    broadcast(req.employee?.company_id ?? 0, 'sales:updated', {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// DELETE /api/sales/:id/forgive — deshace la exoneración: la factura vuelve a deberse
const unforgive = async (req, res) => {
  try {
    const result = await salesService.unforgiveSale(req.params.id, req);
    broadcast(req.employee?.company_id ?? 0, 'sales:updated', {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// GET /api/sales/receivables
const receivables = async (req, res) => {
  try {
    const result = await getReceivables(req.query, req);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// PATCH /api/sales/:id/due-date
const setDueDate = async (req, res) => {
  try {
    const data = await setSaleDueDate(req.params.id, req.body || {}, req);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// POST /api/sales/prescription-photo — sube la foto del récipe médico (módulo Farmacia)
const uploadPrescriptionPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: "Debes adjuntar la foto del récipe" });
    const photo_filename = await saveImage(req.file, "recipe");
    res.status(201).json({ ok: true, data: { photo_filename, photo_url: imageUrl(photo_filename) } });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// GET /api/sales/pharmacy-approvers — empleados activos con permiso pharmacy.approve_controlled
// para que el cajero elija al farmacéutico/supervisor que ingresará su PIN en caja.
const getPharmacyApprovers = async (req, res) => {
  try {
    const { Employee, Role } = require("../models");
    const { effectivePermissions } = require("../config/permissions");
    const { hasPermission } = require("../middleware/auth");
    const emps = await Employee.findAll({
      where: { active: true },
      attributes: ["id", "full_name", "username", "permission_overrides", "approval_pin_hash"],
      include: [{ model: Role, attributes: ["permissions", "label"] }],
      order: [["full_name", "ASC"]],
    });
    const data = emps
      .filter(e => {
        const perms = effectivePermissions(e.Role?.permissions, e.permission_overrides);
        return hasPermission(perms, "pharmacy.approve_controlled");
      })
      .map(e => ({
        id: e.id,
        full_name: e.full_name,
        username: e.username,
        role_label: e.Role?.label || null,
        has_pin: !!e.approval_pin_hash,
      }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener autorizadores" });
  }
};

// POST /api/sales/:id/publish — publica/confirma un borrador asignándole su correlativo oficial
const publish = async (req, res) => {
  const { sequelize, Sale } = require("../models");
  const assignInvoiceNumber = require("../services/sales/assignInvoiceNumber");
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(req.params.id, { transaction: t, lock: true });
    if (!sale) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: "Venta no encontrada" });
    }
    if (!sale.invoice_number) {
      await assignInvoiceNumber(sale, t);
    }
    const newStatus = ["borrador", "espera"].includes(sale.status) ? "pendiente" : sale.status;
    await sale.update({ status: newStatus }, { transaction: t });
    await t.commit();
    res.json({
      ok: true,
      data: {
        id: sale.id,
        invoice_number: sale.invoice_number,
        status: sale.status
      }
    });
  } catch (err) {
    await t.rollback();
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

// POST /api/sales/:id/fiscal — guarda el número y serial impreso por la máquina fiscal
const setFiscal = async (req, res) => {
  const { sequelize, Sale } = require("../models");
  const assignInvoiceNumber = require("../services/sales/assignInvoiceNumber");
  const t = await sequelize.transaction();
  try {
    // Solo un número que imprimió la máquina: dígitos. Así no entra uno de prueba ("P-000001")
    // ni un vacío, y el serial, si viene, es alfanumérico.
    const fiscal_number = String(req.body?.fiscal_number ?? "").trim();
    const fiscal_serial = req.body?.fiscal_serial ? String(req.body.fiscal_serial).trim() : null;
    if (!/^\d{1,20}$/.test(fiscal_number)) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: "Número de factura fiscal no válido" });
    }
    if (fiscal_serial && !/^[A-Za-z0-9]{1,30}$/.test(fiscal_serial)) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: "Serial de máquina fiscal no válido" });
    }
    const sale = await Sale.findByPk(req.params.id, { transaction: t, lock: true });
    if (!sale) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: "Venta no encontrada" });
    }
    // Una venta lleva una sola factura fiscal: otra impresión de la misma venta no pisa la primera.
    if (sale.fiscal_number && sale.fiscal_number !== fiscal_number) {
      await t.rollback();
      return res.status(409).json({ ok: false, message: `Esta venta ya tiene la factura fiscal ${sale.fiscal_number}` });
    }
    if (!sale.invoice_number) {
      await assignInvoiceNumber(sale, t);
    }
    const newStatus = ["borrador", "espera"].includes(sale.status) ? "pendiente" : sale.status;
    await sale.update({
      fiscal_number,
      fiscal_serial,
      status: newStatus
    }, { transaction: t });
    await t.commit();
    res.json({
      ok: true,
      data: {
        id: sale.id,
        invoice_number: sale.invoice_number,
        fiscal_number: sale.fiscal_number,
        fiscal_serial: sale.fiscal_serial,
        status: sale.status
      }
    });
  } catch (err) {
    await t.rollback();
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = { getOne, getAll, getStats, create, syncOffline, cancel, update, confirmCredit, removeFxRate, acceptOrder, claim, release, forgive, unforgive, receivables, setDueDate, uploadPrescriptionPhoto, getPharmacyApprovers, publish, setFiscal };