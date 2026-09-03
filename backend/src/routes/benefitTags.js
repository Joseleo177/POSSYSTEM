const router = require("express").Router();
const ctrl = require("../controllers/benefitTags");
const { auth, permit } = require("../middleware/auth");

router.get("/",       auth, permit("products.view", "inventory.view"), ctrl.getAll);
router.post("/",      auth, permit("products.edit"), ctrl.create);
router.put("/:id",    auth, permit("products.edit"), ctrl.update);
router.delete("/:id", auth, permit("products.edit"), ctrl.remove);

module.exports = router;
