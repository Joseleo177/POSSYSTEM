const router = require("express").Router();
const ctrl   = require("../controllers/categories");
const { auth, permit } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

// La foto de la categoría (opcional, solo la usa la vitrina pública) llega como multipart.
// multer deja pasar sin tocar nada las peticiones JSON de siempre, así que quien crea una
// categoría desde el POS sigue mandando su objeto normal.
const image = upload.single("image");

router.get("/",       auth, permit("products.view", "inventory.view", "sales.create"), ctrl.getAll);
router.post("/",      auth, permit("products.edit"), image, ctrl.create);
router.put("/:id",    auth, permit("products.edit"), image, ctrl.update);
router.delete("/:id", auth, permit("products.edit"), ctrl.remove);

module.exports = router;
