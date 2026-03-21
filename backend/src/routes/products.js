const router  = require("express").Router();
const ctrl    = require("../controllers/products");
const { auth, permit } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

router.get("/",       auth, ctrl.getAll);
router.get("/:id",    auth, ctrl.getOne);
router.post("/",      auth, permit("products", "config"), upload.single("image"), ctrl.create);
router.put("/:id",    auth, permit("products", "config"), upload.single("image"), ctrl.update);
router.delete("/:id", auth, permit("admin"),              ctrl.remove);

module.exports = router;
