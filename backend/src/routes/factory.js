const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const c = require("../controllers/factory");

// El módulo es un extra que el superusuario enciende por empresa (companies.fabrica_enabled),
// como la vitrina. Sin él, ninguna ruta responde aunque el rol tenga los permisos.
const moduloActivo = async (req, res, next) => {
  try {
    const { Company } = require("../models");
    const company = req.company_id ? await Company.findByPk(req.company_id, { attributes: ["fabrica_enabled"] }) : null;
    if (!company?.fabrica_enabled) {
      return res.status(403).json({ ok: false, message: "El módulo Fábrica no está activo para esta empresa" });
    }
    next();
  } catch (err) { next(err); }
};

router.use(auth, moduloActivo);

const ver       = permit("factory.view", "factory.manage");
const gestionar = permit("factory.manage");

router.get   ("/materials",                       ver,       c.materials);
router.post  ("/materials",                       gestionar, c.saveMaterial);
router.get   ("/pieces",                          ver,       c.pieces);
router.post  ("/pieces",                          gestionar, c.registerPieces);
router.get   ("/pieces/:id",                      ver,       c.piece);
router.post  ("/pieces/:id/discharge",            gestionar, c.dischargePiece);

router.get   ("/stages",                          ver,       c.stages);
router.post  ("/stages",                          gestionar, c.saveStage);
router.post  ("/stages/presets",                  gestionar, c.presetStages);
router.put   ("/stages/order",                    gestionar, c.reorderStages);
router.put   ("/stages/:id",                      gestionar, c.saveStage);
router.delete("/stages/:id",                      gestionar, c.deleteStage);

router.post  ("/recipes/evaluate",                gestionar, c.evaluateRecipe);
router.get   ("/recipes",                         ver,       c.recipes);
router.get   ("/recipes/:productId",              ver,       c.recipe);
router.get   ("/recipes/:productId/preview",      ver,       c.recipePreview);
router.put   ("/recipes/:productId",              gestionar, c.saveRecipe);
router.delete("/recipes/:productId",              gestionar, c.deleteRecipe);

router.get   ("/orders",                          ver,       c.orders);
router.post  ("/orders",                          gestionar, c.createOrder);
router.get   ("/orders/:id",                      ver,       c.order);
router.patch ("/orders/:id",                      gestionar, c.updateOrder);
router.put   ("/orders/:id/plan",                 gestionar, c.setOrderPlan);
router.post  ("/orders/:id/pieces",               gestionar, c.deliverPiece);
router.delete("/orders/:id/pieces/:useId",        gestionar, c.cancelDelivery);
router.post  ("/orders/:id/pieces/:useId/return", gestionar, c.returnPiece);
router.post  ("/orders/:id/pieces/:useId/undo",   gestionar, c.undoReturn);
router.post  ("/orders/:id/items",                gestionar, c.addItem);
router.delete("/orders/:id/items/:itemId",        gestionar, c.removeItem);
router.post  ("/orders/:id/finish",               gestionar, c.finishOrder);
router.post  ("/orders/:id/stage",                gestionar, c.moveStage);
router.post  ("/orders/:id/reopen",               gestionar, c.reopenOrder);
router.post  ("/orders/:id/cancel",               gestionar, c.cancelOrder);
router.delete("/orders/:id",                      gestionar, c.deleteOrder);
router.post  ("/orders/:id/invoice",              permit("factory.invoice"), c.invoiceOrder);

module.exports = router;
