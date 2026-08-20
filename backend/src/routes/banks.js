const router   = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const b        = require("../controllers/banks");

router.use(auth);

// ── Bancos ────────────────────────────────────────────────────
router.get   ("/", permit("journals.view", "sales.create"),           b.getAllBanks);
router.post  ("/",           permit("journals.manage"), b.createBank);
router.put   ("/:id",        permit("journals.manage"), b.updateBank);
router.put   ("/:id/toggle", permit("journals.manage"), b.toggleBank);
router.delete("/:id",        permit("journals.manage"), b.deleteBank);

// ── Métodos de pago ───────────────────────────────────────────
router.get   ("/methods", permit("journals.view", "sales.create"),           b.getAllMethods);
router.post  ("/methods",           permit("journals.manage"), b.createMethod);
router.put   ("/methods/:id",       permit("journals.manage"), b.updateMethod);
router.put   ("/methods/:id/toggle",permit("journals.manage"), b.toggleMethod);
router.delete("/methods/:id",       permit("journals.manage"), b.deleteMethod);

module.exports = router;