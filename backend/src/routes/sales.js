const router = require("express").Router();
const ctrl   = require("../controllers/sales");
const { permit, warehouseAccess } = require("../middleware/auth");

router.get("/",          ctrl.getAll);
router.get("/stats",     permit("sales", "reports", "config"), ctrl.getStats);
router.get("/:id",       ctrl.getOne);
// Se vende desde el almacén asignado: sin esto, la API acepta cualquier warehouse_id y la
// venta descuenta stock de otra sucursal.
router.post("/",         permit("sales", "config"), warehouseAccess(req => req.body?.warehouse_id), ctrl.create);
router.patch("/:id",     permit("sales", "admin", "config"), ctrl.update);
router.post("/:id/credit", permit("sales", "config"), ctrl.confirmCredit);
router.post("/:id/accept-order", permit("sales", "config"), warehouseAccess(req => req.body?.warehouse_id), ctrl.acceptOrder);
// Tomar y soltar una cuenta en espera. Llevan el mismo permiso que cobrar porque son parte
// de atenderla, no una acción administrativa. Liberar la cuenta de OTRO cajero sí exige ser
// admin, y eso lo resuelve el controlador leyendo los permisos del empleado.
router.post("/:id/claim",   permit("sales", "config"), ctrl.claim);
router.delete("/:id/claim", permit("sales", "config"), ctrl.release);
router.delete("/:id",    permit("sales", "admin", "config"), ctrl.cancel);

module.exports = router;
