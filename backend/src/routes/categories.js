const router = require("express").Router();
const ctrl   = require("../controllers/categories");
const { permit } = require("../middleware/auth");

router.get("/",       ctrl.getAll);
router.post("/",      permit("config"), ctrl.create);
router.put("/:id",    permit("config"), ctrl.update);
router.delete("/:id", permit("config"), ctrl.remove);

module.exports = router;
