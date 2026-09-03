const router = require("express").Router();
const ctrl = require("../controllers/catalogBanners");
const { auth, permit } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

// Los banners son la portada de la tienda de cara a internet, así que se editan con el
// mismo permiso que el resto de la configuración pública del catálogo.
const fields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "image_mobile", maxCount: 1 },
]);

router.get("/",        auth, ctrl.getAll);
router.post("/",       auth, permit("config.edit"), fields, ctrl.create);
router.put("/reorder", auth, permit("config.edit"), ctrl.reorder);
router.put("/:id",     auth, permit("config.edit"), fields, ctrl.update);
router.delete("/:id",  auth, permit("config.edit"), ctrl.remove);

module.exports = router;
