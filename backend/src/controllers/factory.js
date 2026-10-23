const svc = require("../services/factory");

const handle = (fn) => async (req, res, next) => {
  try {
    const out = await fn(req);
    res.json({ ok: true, ...out });
  } catch (err) { next(err); }
};

exports.materials      = handle(req => svc.listMaterials(req, req.query));
exports.saveMaterial   = handle(req => svc.saveMaterial(req, req.body));
exports.pieces         = handle(req => svc.listPieces(req, req.query));
exports.registerPieces = handle(req => svc.registerPieces(req, req.body));
exports.piece          = handle(req => svc.getPiece(req, req.params.id));
exports.dischargePiece = handle(req => svc.dischargePiece(req, req.params.id, req.body));

exports.stages         = handle(req => svc.listStages(req, req.query));
exports.saveStage      = handle(req => svc.saveStage(req, { ...req.body, id: req.params.id || req.body.id }));
exports.reorderStages  = handle(req => svc.reorderStages(req, req.body));
exports.deleteStage    = handle(req => svc.deleteStage(req, req.params.id));
exports.presetStages   = handle(req => svc.createPresetStages(req));
exports.moveStage      = handle(req => svc.moveStage(req, req.params.id, req.body));
exports.evaluateRecipe = handle(req => svc.evaluateDraft(req, req.body));

exports.recipes        = handle(req => svc.listRecipes(req));
exports.recipe         = handle(req => svc.getRecipe(req, req.params.productId));
exports.recipePreview  = handle(req => svc.previewRecipe(req, req.params.productId, req.query));
exports.saveRecipe     = handle(req => svc.saveRecipe(req, req.params.productId, req.body));
exports.deleteRecipe   = handle(req => svc.deleteRecipe(req, req.params.productId));

exports.orders         = handle(req => svc.listOrders(req, req.query));
exports.order          = handle(req => svc.getOrder(req, req.params.id));
exports.createOrder    = handle(req => svc.createOrder(req, req.body));
exports.updateOrder    = handle(req => svc.updateOrder(req, req.params.id, req.body));
exports.deliverPiece   = handle(req => svc.deliverPiece(req, req.params.id, req.body));
exports.cancelDelivery = handle(req => svc.cancelDelivery(req, req.params.id, req.params.useId));
exports.returnPiece    = handle(req => svc.returnPiece(req, req.params.id, req.params.useId, req.body));
exports.undoReturn     = handle(req => svc.undoReturn(req, req.params.id, req.params.useId));
exports.addItem        = handle(req => svc.addItem(req, req.params.id, req.body));
exports.removeItem     = handle(req => svc.removeItem(req, req.params.id, req.params.itemId));
exports.finishOrder    = handle(req => svc.finishOrder(req, req.params.id, req.body));
exports.reopenOrder    = handle(req => svc.reopenOrder(req, req.params.id));
exports.cancelOrder    = handle(req => svc.cancelOrder(req, req.params.id, req.body));
exports.invoiceOrder   = handle(req => svc.invoiceOrder(req, req.params.id, req.body));
