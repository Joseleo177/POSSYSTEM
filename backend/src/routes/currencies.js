const router = require("express").Router();
const ctrl   = require("../controllers/currencies");
const { auth, permit } = require("../middleware/auth");

router.get("/",              auth, ctrl.getAll);
// Antes que las rutas con :id, para que "rates" no se lea como id.
router.get("/rates/on",      auth, ctrl.getRatesOn);
router.get("/:id/rates",     auth, permit("currencies.manage"), ctrl.getHistory);
router.put("/:id/rates/:date", auth, permit("currencies.manage"), ctrl.putDayRate);
router.get("/bcv",           auth, permit("currencies.manage"), ctrl.getBcvPreview);
router.post("/refresh",      auth, permit("currencies.manage"), ctrl.refreshRates);
router.post("/",             auth, permit("currencies.manage"), ctrl.create);
router.put("/:id/rate",      auth, permit("currencies.manage"), ctrl.updateRate);
router.put("/:id/toggle",    auth, permit("currencies.manage"), ctrl.toggle);
router.delete("/:id",        auth, permit("currencies.manage"), ctrl.remove);

module.exports = router;
