const router = require("express").Router();
const ctrl   = require("../controllers/sales");
const { permit, warehouseAccess } = require("../middleware/auth");

router.get("/", permit("sales.view"),          ctrl.getAll);
router.get("/stats",     permit("sales.view"), ctrl.getStats);
router.get("/:id", permit("sales.view"),       ctrl.getOne);
// Se vende desde el almacén asignado: sin esto, la API acepta cualquier warehouse_id y la
// venta descuenta stock de otra sucursal.
router.post("/",         permit("sales.create"), warehouseAccess(req => req.body?.warehouse_id), ctrl.create);
router.patch("/:id",     permit("sales.edit"), ctrl.update);
router.post("/:id/credit", permit("sales.credit"), ctrl.confirmCredit);
router.post("/:id/accept-order", permit("sales.create"), warehouseAccess(req => req.body?.warehouse_id), ctrl.acceptOrder);
// Tomar y soltar una cuenta en espera. Llevan el mismo permiso que cobrar porque son parte
// de atenderla, no una acción administrativa. Liberar la cuenta de OTRO cajero sí exige ser
// admin, y eso lo resuelve el controlador leyendo los permisos del empleado.
router.post("/:id/claim",   permit("sales.edit"), ctrl.claim);
router.delete("/:id/claim", permit("sales.edit"), ctrl.release);
// Exonerar el saldo. Permiso propio: cerrar una factura sin cobrarla no es cobrar ni anular,
// y quien puede una cosa no debería poder la otra por arrastre.
router.post("/:id/forgive",   permit("sales.forgive"), ctrl.forgive);
router.delete("/:id/forgive", permit("sales.forgive"), ctrl.unforgive);
router.delete("/:id",    permit("sales.void"), ctrl.cancel);

module.exports = router;
