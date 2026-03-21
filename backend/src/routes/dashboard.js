const router = require("express").Router();
const ctrl   = require("../controllers/dashboard");
const { auth } = require("../middleware/auth");

router.get("/", auth, ctrl.getDashboard);

module.exports = router;
