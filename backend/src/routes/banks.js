const router   = require("express").Router();
const { auth } = require("../middleware/auth");
const b        = require("../controllers/banks");

router.use(auth);

// ── Bancos ────────────────────────────────────────────────────
router.get   ("/",           b.getAllBanks);
router.post  ("/",           b.createBank);
router.put   ("/:id",        b.updateBank);
router.put   ("/:id/toggle", b.toggleBank);
router.delete("/:id",        b.deleteBank);

// ── Métodos de pago ───────────────────────────────────────────
router.get   ("/methods",           b.getAllMethods);
router.post  ("/methods",           b.createMethod);
router.put   ("/methods/:id",       b.updateMethod);
router.put   ("/methods/:id/toggle",b.toggleMethod);
router.delete("/methods/:id",       b.deleteMethod);

module.exports = router;