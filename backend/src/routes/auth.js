const router = require("express").Router();
const ctrl   = require("../controllers/auth");
const { auth } = require("../middleware/auth");

router.post("/login",           ctrl.login);
router.get("/me",               auth, ctrl.me);
router.post("/change-password", auth, ctrl.changePassword);

module.exports = router;
