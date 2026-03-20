const express = require("express");
const router  = express.Router();
const { auth } = require("../middleware/auth");
const { getAll, getPending, getStats, create, remove } = require("../controllers/payments");

router.get("/stats",   auth, getStats);
router.get("/pending", auth, getPending);
router.get("/",        auth, getAll);
router.post("/",       auth, create);
router.delete("/:id",  auth, remove);

module.exports = router;
