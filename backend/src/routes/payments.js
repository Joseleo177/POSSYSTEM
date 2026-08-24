const express = require("express");
const router  = express.Router();
const { auth, permit } = require("../middleware/auth");
const { getAll, getPending, getStats, create, createBulk, remove, removeBatch } = require("../controllers/payments");

router.get("/stats",   auth, permit("accounting.view", "sales.view"), getStats);
router.get("/pending", auth, permit("accounting.view", "sales.view"), getPending);
router.get("/",        auth, permit("accounting.view", "sales.view"), getAll);
router.post("/",       auth, permit("sales.create"), create);
router.post("/bulk",   auth, permit("sales.create"), createBulk);
// El lote va antes que "/:id" para que Express no lea "batch" como el id de un cobro.
router.delete("/batch/:batchId", auth, permit("accounting.delete"), removeBatch);
router.delete("/:id",  auth, permit("accounting.delete"), remove);

module.exports = router;
