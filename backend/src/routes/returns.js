const router = require("express").Router();
const ctrl   = require("../controllers/returns");
const { auth, permit } = require("../middleware/auth");

router.post ("/:id/return",   auth, permit("sales", "admin", "config"), ctrl.createReturn);
router.post ("/:id/exchange", auth, permit("sales", "admin", "config"), ctrl.createExchange);
router.get  ("/:id/returns",  auth, ctrl.getSaleReturns);

module.exports = router;
