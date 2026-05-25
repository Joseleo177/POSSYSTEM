const router = require("express").Router();
const ctrl   = require("../controllers/creditNotes");
const { auth, permit } = require("../middleware/auth");

router.get("/", auth, permit("accounting", "admin", "config"), ctrl.getAll);

module.exports = router;
