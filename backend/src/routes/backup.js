const router = require("express").Router();
const ctrl   = require("../controllers/backup");
const { auth, permit } = require("../middleware/auth");

router.get("/",                  auth, permit("config"), ctrl.listBackups);
router.post("/trigger",          auth, permit("config"), ctrl.triggerBackup);
router.get("/download/:filename", auth, permit("config"), ctrl.downloadBackup);
router.delete("/:filename",      auth, permit("config"), ctrl.deleteBackup);

module.exports = router;
