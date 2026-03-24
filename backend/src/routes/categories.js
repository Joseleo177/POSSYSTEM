const router = require("express").Router();
const ctrl   = require("../controllers/categories");
const { auth, permit } = require("../middleware/auth");

router.get("/",       auth, permit("products", "inventory", "config"), ctrl.getAll);
router.post("/",      auth, permit("config"), ctrl.create);
router.put("/:id",    auth, permit("config"), ctrl.update);
router.delete("/:id", auth, permit("config"), ctrl.remove);

module.exports = router;
