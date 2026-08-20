const router = require("express").Router();
const ctrl   = require("../controllers/returns");
const { auth, permit } = require("../middleware/auth");

router.post ("/:id/return",   auth, permit("sales.return"), ctrl.createReturn);
router.post ("/:id/exchange", auth, permit("sales.return"), ctrl.createExchange);
router.get  ("/:id/returns",  auth, permit("sales.view"), ctrl.getSaleReturns);

module.exports = router;
