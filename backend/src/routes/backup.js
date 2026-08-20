const router = require("express").Router();
const ctrl   = require("../controllers/backup");
const { auth, permit } = require("../middleware/auth");

router.get("/",                  auth, permit("backup.manage"), ctrl.listBackups);
router.post("/trigger",          auth, permit("backup.manage"), ctrl.triggerBackup);
router.get("/download/:filename", auth, permit("backup.manage"), ctrl.downloadBackup);
router.delete("/:filename",      auth, permit("backup.manage"), ctrl.deleteBackup);

module.exports = router;
