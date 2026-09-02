const router  = require("express").Router();
const ctrl    = require("../controllers/products");
const { auth, permit } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

router.get("/",       auth, permit("products.view"), ctrl.getAll);
// Antes de "/:id" para que la ruta literal no quede tapada por el parámetro.
router.patch("/catalog-visibility", auth, permit("products.edit"), ctrl.setCatalogVisibility);
// Importar crea productos y además pisa los que ya existen, así que exige las dos cosas.
router.post("/import", auth, permit("products.create"), permit("products.edit"), ctrl.importar);
router.get("/:id",    auth, permit("products.view"), ctrl.getOne);
router.post("/",      auth, permit("products.create"), upload.single("image"), ctrl.create);
router.put("/:id",    auth, permit("products.edit"), upload.single("image"), ctrl.update);
router.delete("/:id", auth, permit("products.delete"),              ctrl.remove);

module.exports = router;
