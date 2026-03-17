const router = require("express").Router();
const ctrl   = require("../controllers/sales");

router.get("/",          ctrl.getAll);
router.get("/stats",     ctrl.getStats);
router.post("/",         ctrl.create);
router.delete("/:id",   ctrl.cancel);

module.exports = router;
