const express = require("express");
const router  = express.Router();
const { auth, permit } = require("../middleware/auth");
const { getAll, getPending, getStats, create, remove } = require("../controllers/payments");

router.get("/stats",   auth, permit("accounting.view", "sales.view"), getStats);
router.get("/pending", auth, permit("accounting.view", "sales.view"), getPending);
router.get("/",        auth, permit("accounting.view", "sales.view"), getAll);
router.post("/",       auth, permit("sales.create"), create);
router.delete("/:id",  auth, permit("accounting.delete"), remove);

module.exports = router;
