const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const ctrl = require("../controllers/purchases");
const ppCtrl = require("../controllers/purchasePayments");

router.use(auth);

router.get("/",     permit("products", "inventory"), ctrl.getAll);
router.get("/:id",  permit("products", "inventory"), ctrl.getOne);
router.post("/",    permit("products", "inventory"), ctrl.create);
router.delete("/:id", permit("admin", "products"),  ctrl.remove);

// Pagos de compras
router.get("/:id/payments",  permit("products", "inventory"), ppCtrl.getPayments);
router.post("/:id/payments", permit("products", "inventory"), ppCtrl.createPayment);

module.exports = router;
