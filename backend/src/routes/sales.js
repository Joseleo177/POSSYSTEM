const router = require("express").Router();
const ctrl   = require("../controllers/sales");
const { permit } = require("../middleware/auth");

router.get("/",          ctrl.getAll);
router.get("/stats",     permit("sales", "reports", "config"), ctrl.getStats);
router.get("/:id",       ctrl.getOne);
router.post("/",         permit("sales", "config"), ctrl.create);
router.delete("/:id",    permit("sales", "admin", "config"), ctrl.cancel);

module.exports = router;
