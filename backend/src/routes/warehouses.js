const router   = require("express").Router();
const { auth, permit, warehouseAccess } = require("../middleware/auth");
const wh       = require("../controllers/warehouses");

router.use(auth);

// Toda ruta con `:id` de almacén pasa por warehouseAccess: `permit()` solo valida el rol,
// no el almacén. Sin esto, un gerente asignado a un almacén podía operar sobre los demás.
const ownWarehouse = warehouseAccess();

// ── Almacenes ─────────────────────────────────────────────────
// Crear, editar, borrar y asignar usuarios es administración del almacén: solo admin.
router.get   ("/",                   wh.getAll);
router.post  ("/",                   permit("admin"), wh.create);
router.put   ("/:id",                permit("admin"), wh.update);
router.delete("/:id",                permit("admin"), wh.remove);

// ── Stock ─────────────────────────────────────────────────────
router.get  ("/:id/stock",           ownWarehouse, wh.getStock);
router.post ("/:id/stock",           permit("inventory", "admin", "config"), ownWarehouse, wh.addStock);
router.put  ("/:id/stock/:productId",permit("inventory", "admin", "config"), ownWarehouse, wh.setStock);
router.delete("/:id/stock/:productId",permit("admin", "config"),             ownWarehouse, wh.removeStock);
router.get  ("/:id/products",        ownWarehouse, wh.getProducts);

// ── Empleados por almacén ─────────────────────────────────────
router.get  ("/employee/:employeeId", wh.getByEmployee);
router.put  ("/:id/employees",        permit("admin"), wh.assignEmployees);

// ── Transferencias ────────────────────────────────────────────
// El origen debe ser un almacén propio; el destino puede ser cualquiera de la empresa.
router.post ("/transfer",            permit("inventory", "admin", "config"),
                                     warehouseAccess(req => req.body?.from_warehouse_id),
                                     wh.transfer);
router.get  ("/transfers",           wh.getTransfers);

// ── Sesiones de Movimiento Manual ─────────────────────────────
router.get  ("/:id/sessions",                                permit("inventory", "admin", "config"), ownWarehouse, wh.getSessions);
router.get  ("/:id/sessions/active",                         permit("inventory", "admin", "config"), ownWarehouse, wh.getActiveSession);
router.post ("/:id/sessions",                                permit("inventory", "admin", "config"), ownWarehouse, wh.openSession);
router.post ("/:id/sessions/:sessionId/lines",               permit("inventory", "admin", "config"), ownWarehouse, wh.addLine);
router.patch("/:id/sessions/:sessionId/close",               permit("inventory", "admin", "config"), ownWarehouse, wh.closeSession);

module.exports = router;