const router = require("express").Router();
const ctrl   = require("../controllers/currencies");
const { auth, permit } = require("../middleware/auth");

router.get("/",              auth, ctrl.getAll);
router.post("/refresh",      auth, permit("config"), ctrl.refreshRates);
router.post("/",             auth, permit("config"), ctrl.create);
router.put("/:id/rate",      auth, permit("config"), ctrl.updateRate);
router.put("/:id/toggle",    auth, permit("config"), ctrl.toggle);

module.exports = router;
