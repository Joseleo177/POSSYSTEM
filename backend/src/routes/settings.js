const router = require("express").Router();
const ctrl   = require("../controllers/settings");
const { auth, permit } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

router.get("/",        auth, ctrl.getAll);
router.put("/",        auth, permit("config"), ctrl.update);
router.post("/logo",   auth, permit("config"), upload.single("logo"), ctrl.uploadLogo);

module.exports = router;
