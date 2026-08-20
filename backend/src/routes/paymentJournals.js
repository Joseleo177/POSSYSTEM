const router = require("express").Router();
const ctrl   = require("../controllers/paymentJournals");
const { auth, permit } = require("../middleware/auth");

router.get("/",                        auth, permit("journals.view", "sales.create", "purchases.pay", "accounting.view"), ctrl.getAll);
router.get("/summary",                 auth, permit("journals.view"), ctrl.summary);
router.get("/bank/:bankId/movements",  auth, permit("journals.view"), ctrl.bankMovements);
router.get("/:id/movements",           auth, permit("journals.view"), ctrl.movements);
router.post("/",             auth, permit("journals.manage"), ctrl.create);
router.put("/:id",           auth, permit("journals.manage"), ctrl.update);
router.delete("/:id",        auth, permit("journals.manage"), ctrl.remove);

module.exports = router;
