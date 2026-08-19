const router = require("express").Router();
const { auth, permit, warehouseAccess } = require("../middleware/auth");
const ctrl = require("../controllers/purchases");
const ppCtrl = require("../controllers/purchasePayments");

router.use(auth);

// El almacén de destino debe ser uno de los asignados al empleado. Es opcional porque un
// borrador puede guardarse antes de elegir destino; al recibir la mercancía el servicio
// vuelve a validarlo, y ahí ya no puede estar vacío.
const destWarehouse = warehouseAccess(req => req.body?.warehouse_id, { optional: true });

router.get("/",     permit("products", "inventory"), ctrl.getAll);
router.get("/:id",  permit("products", "inventory"), ctrl.getOne);
router.post("/",    permit("products", "inventory"), destWarehouse, ctrl.create);
router.patch("/:id",         permit("products", "inventory"), destWarehouse, ctrl.updateDraft);
router.patch("/:id/confirm", permit("products", "inventory"), ctrl.confirm);
router.patch("/:id/lots",    permit("products", "inventory"), ctrl.updateLots);
router.patch("/:id/receive", permit("products", "inventory"), ctrl.receive);
router.delete("/:id", permit("admin", "products"),  ctrl.remove);

// Pagos de compras
router.get("/:id/payments",  permit("products", "inventory"), ppCtrl.getPayments);
router.post("/:id/payments", permit("products", "inventory"), ppCtrl.createPayment);

module.exports = router;
