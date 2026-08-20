const router = require("express").Router();
const { auth, permit, warehouseAccess } = require("../middleware/auth");
const ctrl = require("../controllers/purchases");
const ppCtrl = require("../controllers/purchasePayments");

router.use(auth);

// El almacén de destino debe ser uno de los asignados al empleado. Es opcional porque un
// borrador puede guardarse antes de elegir destino; al recibir la mercancía el servicio
// vuelve a validarlo, y ahí ya no puede estar vacío.
const destWarehouse = warehouseAccess(req => req.body?.warehouse_id, { optional: true });

router.get("/",     permit("purchases.view"), ctrl.getAll);
router.get("/:id",  permit("purchases.view"), ctrl.getOne);
router.post("/",    permit("purchases.create"), destWarehouse, ctrl.create);
router.patch("/:id",         permit("purchases.edit"), destWarehouse, ctrl.updateDraft);
router.patch("/:id/confirm", permit("purchases.edit"), ctrl.confirm);
router.patch("/:id/lots",    permit("purchases.edit"), ctrl.updateLots);
router.patch("/:id/receive", permit("purchases.receive"), ctrl.receive);
router.delete("/:id", permit("purchases.delete"),  ctrl.remove);

// Pagos de compras
router.get("/:id/payments",  permit("purchases.view"), ppCtrl.getPayments);
router.post("/:id/payments", permit("purchases.pay"), ppCtrl.createPayment);

module.exports = router;
