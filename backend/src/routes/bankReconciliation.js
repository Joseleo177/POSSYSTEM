const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const c = require("../controllers/bankReconciliation");

// Todo bajo un solo permiso: quien concilia ve el extracto, casa, registra comisiones y deshace.
// Los movimientos que crea (egresos, ingresos) quedan a la vista en sus pantallas de siempre.
router.use(auth, permit("accounting.reconcile"));

router.get   ("/accounts",                      c.accounts);
router.get   ("/",                              c.list);
router.post  ("/",                              c.create);
router.get   ("/:id",                           c.getOne);
router.delete("/:id",                           c.remove);
router.post  ("/:id/auto",                      c.auto);
router.post  ("/:id/charges",                   c.charges);
router.get   ("/:id/lines/:lineId/candidates",  c.candidates);
router.post  ("/:id/lines/:lineId/match",       c.match);
router.post  ("/:id/lines/:lineId/register",    c.register);
router.post  ("/:id/lines/:lineId/ignore",      c.ignore);
router.post  ("/:id/lines/:lineId/unmatch",     c.unmatch);

module.exports = router;
