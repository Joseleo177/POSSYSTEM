const router = require("express").Router();
const ctrl = require("../controllers/productAttributes");
const { auth, permit } = require("../middleware/auth");

// La caja también los lee: arma la grilla talla × color con ellos.
router.get("/",       auth, permit("products.view", "inventory.view", "sales.create"), ctrl.getAll);
router.post("/",      auth, permit("products.edit", "products.create"), ctrl.create);
router.put("/:id",    auth, permit("products.edit"), ctrl.rename);
router.delete("/:id", auth, permit("products.edit"), ctrl.remove);
router.post("/:id/values",            auth, permit("products.edit", "products.create"), ctrl.addValues);
router.put("/:id/values/order",       auth, permit("products.edit"), ctrl.reorder);
router.put("/:id/values/:valueId",    auth, permit("products.edit"), ctrl.renameValue);
router.delete("/:id/values/:valueId", auth, permit("products.edit"), ctrl.removeValue);

module.exports = router;
