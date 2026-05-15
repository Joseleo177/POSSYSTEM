const router = require("express").Router();
const ctrl = require("../controllers/promotions");
const { auth, permit } = require("../middleware/auth");

router.get("/active", auth, ctrl.getActive);
router.get("/",       auth, permit("products", "config"), ctrl.getAll);
router.post("/",      auth, permit("products", "config"), ctrl.create);
router.put("/:id",    auth, permit("products", "config"), ctrl.update);
router.delete("/:id", auth, permit("products", "config"), ctrl.remove);

module.exports = router;
