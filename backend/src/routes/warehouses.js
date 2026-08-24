const router   = require("express").Router();
const { auth, permit, warehouseAccess } = require("../middleware/auth");
const wh       = require("../controllers/warehouses");

router.use(auth);

// Toda ruta con `:id` de almacén pasa por warehouseAccess: `permit()` solo valida el rol,
// no el almacén. Sin esto, un gerente asignado a un almacén podía operar sobre los demás.
const ownWarehouse = warehouseAccess();

// ── Almacenes ─────────────────────────────────────────────────
// Crear, editar, borrar y asignar usuarios es administración del almacén: solo admin.
router.get   ("/", permit("inventory.view"),                   wh.getAll);
router.post  ("/",                   permit("inventory.manage"), wh.create);
router.put   ("/:id",                permit("inventory.manage"), wh.update);
router.delete("/:id",                permit("inventory.manage"), wh.remove);

// ── Stock ─────────────────────────────────────────────────────
router.get  ("/:id/stock", permit("inventory.view"),           ownWarehouse, wh.getStock);
router.post ("/:id/stock",           permit("inventory.adjust"), ownWarehouse, wh.addStock);
router.put  ("/:id/stock/:productId",permit("inventory.adjust"), ownWarehouse, wh.setStock);
router.delete("/:id/stock/:productId",permit("inventory.adjust"),             ownWarehouse, wh.removeStock);
router.get  ("/:id/products", permit("inventory.view"),        ownWarehouse, wh.getProducts);

// ── Empleados por almacén ─────────────────────────────────────
router.get  ("/employee/:employeeId", wh.getByEmployee);
router.put  ("/:id/employees",        permit("inventory.manage"), wh.assignEmployees);

// ── Transferencias ────────────────────────────────────────────
// Documento de dos tiempos: `transfer` despacha (saca del origen, deja en tránsito) y
// `receive` acredita en el destino solo lo que el receptor confirma.
//
// El origen debe ser un almacén propio; el destino puede ser cualquiera de la empresa.
router.post ("/transfer",            permit("inventory.transfer"),
                                     warehouseAccess(req => req.body?.from_warehouse_id),
                                     wh.transfer);
router.get  ("/transfers", permit("inventory.view"),           wh.getTransfers);
// `summary` antes que `:id`, o el correlativo se lo come la ruta de detalle.
router.get  ("/transfers/summary",   permit("inventory.view"), wh.transferSummary);
router.get  ("/transfers/:id",       permit("inventory.view"), wh.getTransfer);

// Recibir es del destino y lleva permiso propio: quien despacha no puede firmar su propia
// llegada. El acceso al almacén se valida en el servicio, porque el destino sale de la fila
// guardada, no del request.
router.post ("/transfers/:id/receive", permit("inventory.receive"),  wh.receiveTransfer);
// Resolver faltantes y anular mueven stock del ORIGEN: van con el permiso de transferir.
router.post ("/transfers/:id/resolve", permit("inventory.transfer"), wh.resolveTransfer);
router.post ("/transfers/:id/cancel",  permit("inventory.transfer"), wh.cancelTransfer);

// ── Sesiones de Movimiento Manual ─────────────────────────────
router.get  ("/:id/sessions",                                permit("inventory.adjust"), ownWarehouse, wh.getSessions);
router.get  ("/:id/sessions/active",                         permit("inventory.adjust"), ownWarehouse, wh.getActiveSession);
router.post ("/:id/sessions",                                permit("inventory.adjust"), ownWarehouse, wh.openSession);
router.post ("/:id/sessions/:sessionId/lines",               permit("inventory.adjust"), ownWarehouse, wh.addLine);
router.patch("/:id/sessions/:sessionId/close",               permit("inventory.adjust"), ownWarehouse, wh.closeSession);

module.exports = router;