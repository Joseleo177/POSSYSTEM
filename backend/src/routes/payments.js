const express = require("express");
const router  = express.Router();
const { auth, permit } = require("../middleware/auth");
const { getAll, getPending, getStats, create, remove } = require("../controllers/payments");

router.get("/stats",   auth, permit("sales", "reports", "config"), getStats);
router.get("/pending", auth, permit("sales", "reports", "config"), getPending);
router.get("/",        auth, permit("sales", "reports", "config"), getAll);
router.post("/",       auth, permit("sales", "customers", "config"), create);
router.delete("/:id",  auth, permit("config"), remove);

module.exports = router;
