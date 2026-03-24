const router = require("express").Router();
const ctrl   = require("../controllers/dashboard");
const { auth, permit } = require("../middleware/auth");

router.get("/", auth, permit("sales", "reports", "inventory", "config"), ctrl.getDashboard);

module.exports = router;
