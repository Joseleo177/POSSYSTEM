const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const ctrl = require("../controllers/purchases");

router.use(auth);

router.get("/",     permit("products", "inventory"), ctrl.getAll);
router.get("/:id",  permit("products", "inventory"), ctrl.getOne);
router.post("/",    permit("products", "inventory"), ctrl.create);
router.delete("/:id", permit("admin", "products"),  ctrl.remove);

module.exports = router;
