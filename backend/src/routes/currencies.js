const router = require("express").Router();
const ctrl   = require("../controllers/currencies");
const { auth, permit } = require("../middleware/auth");

router.get("/",              auth, ctrl.getAll);
router.post("/refresh",      auth, permit("currencies.manage"), ctrl.refreshRates);
router.post("/",             auth, permit("currencies.manage"), ctrl.create);
router.put("/:id/rate",      auth, permit("currencies.manage"), ctrl.updateRate);
router.put("/:id/toggle",    auth, permit("currencies.manage"), ctrl.toggle);
router.delete("/:id",        auth, permit("currencies.manage"), ctrl.remove);

module.exports = router;
