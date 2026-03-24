const router   = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const b        = require("../controllers/banks");

router.use(auth);

// ── Bancos ────────────────────────────────────────────────────
router.get   ("/",           b.getAllBanks);
router.post  ("/",           permit("config"), b.createBank);
router.put   ("/:id",        permit("config"), b.updateBank);
router.put   ("/:id/toggle", permit("config"), b.toggleBank);
router.delete("/:id",        permit("config"), b.deleteBank);

// ── Métodos de pago ───────────────────────────────────────────
router.get   ("/methods",           b.getAllMethods);
router.post  ("/methods",           permit("config"), b.createMethod);
router.put   ("/methods/:id",       permit("config"), b.updateMethod);
router.put   ("/methods/:id/toggle",permit("config"), b.toggleMethod);
router.delete("/methods/:id",       permit("config"), b.deleteMethod);

module.exports = router;