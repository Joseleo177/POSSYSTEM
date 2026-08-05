const router  = require("express").Router();
const ctrl    = require("../controllers/products");
const { auth, permit } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

router.get("/",       auth, ctrl.getAll);
// Antes de "/:id" para que la ruta literal no quede tapada por el parámetro.
router.patch("/catalog-visibility", auth, permit("products", "config"), ctrl.setCatalogVisibility);
router.get("/:id",    auth, ctrl.getOne);
router.post("/",      auth, permit("products", "config"), upload.single("image"), ctrl.create);
router.put("/:id",    auth, permit("products", "config"), upload.single("image"), ctrl.update);
router.delete("/:id", auth, permit("admin"),              ctrl.remove);

module.exports = router;
