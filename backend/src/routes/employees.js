const router = require("express").Router();
const ctrl   = require("../controllers/employees");
const { auth, permit } = require("../middleware/auth");

router.get("/roles",  auth, ctrl.getRoles);
router.get("/",       auth, permit("admin"), ctrl.getAll);
router.post("/",      auth, permit("admin"), ctrl.create);
router.put("/:id",    auth, permit("admin"), ctrl.update);
router.delete("/:id", auth, permit("admin"), ctrl.remove);

module.exports = router;
