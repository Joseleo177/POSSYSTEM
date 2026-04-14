const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const ctrl = require("../controllers/purchasePayments");

router.use(auth);

router.delete("/:id", permit("admin", "products"), ctrl.removePayment);

module.exports = router;
