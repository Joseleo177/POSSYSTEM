const router  = require("express").Router();
const ctrl    = require("../controllers/products");
const { auth, permit } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

router.get("/",       auth, permit("products.view"), ctrl.getAll);
// Antes de "/:id" para que la ruta literal no quede tapada por el parámetro.
router.patch("/catalog-visibility", auth, permit("products.edit"), ctrl.setCatalogVisibility);
// Hereda en lote la imagen de otra tienda para los productos sin foto (por código de barras).
router.post("/backfill-images", auth, permit("products.edit"), ctrl.backfillImages);
// Importar crea productos y además pisa los que ya existen, así que exige las dos cosas.
router.post("/import", auth, permit("products.create"), permit("products.edit"), ctrl.importar);
// Datos del catálogo en PDF para mayoristas (lo arma el navegador). Literal, antes de "/:id".
router.get("/catalog-pdf", auth, permit("products.view"), ctrl.catalogPdf);
// Variantes de un modelo (talla × color). También la caja, que arma la grilla con esto.
router.get("/:id/variants", auth, permit("products.view", "sales.create"), require("../controllers/productAttributes").variants);
// Foto por color de un modelo con variantes.
router.put("/:id/variant-image", auth, permit("products.edit"), upload.single("image"), ctrl.variantImage);
// Fotos adicionales (la principal va con el producto). "order" antes de ":imageId".
router.get("/:id/images",                     auth, permit("products.view"), ctrl.images.listar);
router.post("/:id/images",                    auth, permit("products.edit"), upload.single("image"), ctrl.images.agregar);
router.put("/:id/images/order",               auth, permit("products.edit"), ctrl.images.ordenar);
router.patch("/:id/images/:imageId",          auth, permit("products.edit"), ctrl.images.renombrar);
router.post("/:id/images/:imageId/principal", auth, permit("products.edit"), ctrl.images.hacerPrincipal);
router.delete("/:id/images/:imageId",         auth, permit("products.edit"), ctrl.images.eliminar);
router.get("/:id",    auth, permit("products.view"), ctrl.getOne);
router.post("/",      auth, permit("products.create"), upload.single("image"), ctrl.create);
router.put("/:id",    auth, permit("products.edit"), upload.single("image"), ctrl.update);
router.delete("/:id", auth, permit("products.delete"),              ctrl.remove);

module.exports = router;
