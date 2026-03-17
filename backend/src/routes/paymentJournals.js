const router = require("express").Router();
const ctrl   = require("../controllers/paymentJournals");
const { auth, permit } = require("../middleware/auth");

router.get("/",          auth, ctrl.getAll);
router.get("/summary",   auth, ctrl.summary);
router.post("/",         auth, permit("config"), ctrl.create);
router.put("/:id",       auth, permit("config"), ctrl.update);
router.delete("/:id",    auth, permit("config"), ctrl.remove);

module.exports = router;
