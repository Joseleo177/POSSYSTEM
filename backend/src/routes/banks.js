const router   = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const { upload } = require("../middleware/upload");
const b        = require("../controllers/banks");

router.use(auth);

// El logo es opcional: multer deja pasar sin tocar nada las peticiones JSON de siempre, así
// que crear/editar un banco o método sin foto sigue funcionando igual que antes.
const logo = upload.single("image");

// ── Bancos ────────────────────────────────────────────────────
router.get   ("/", permit("journals.view", "sales.create"),           b.getAllBanks);
router.post  ("/",           permit("journals.manage"), logo, b.createBank);
router.put   ("/:id",        permit("journals.manage"), logo, b.updateBank);
router.put   ("/:id/toggle", permit("journals.manage"), b.toggleBank);
router.delete("/:id",        permit("journals.manage"), b.deleteBank);

// ── Métodos de pago ───────────────────────────────────────────
router.get   ("/methods", permit("journals.view", "sales.create"),           b.getAllMethods);
router.post  ("/methods",           permit("journals.manage"), logo, b.createMethod);
router.put   ("/methods/:id",       permit("journals.manage"), logo, b.updateMethod);
router.put   ("/methods/:id/toggle",permit("journals.manage"), b.toggleMethod);
router.delete("/methods/:id",       permit("journals.manage"), b.deleteMethod);

module.exports = router;
