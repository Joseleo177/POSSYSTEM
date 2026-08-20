const express = require("express");
const router  = express.Router();
const { auth, permit } = require("../middleware/auth");
const { getAll, getMy, create, update, remove, addRange, removeRange, assignUsers } = require("../controllers/series");

router.get("/my",                  auth, getMy);
router.get("/",                    auth, permit("series.view"), getAll);
router.post("/",                   auth, permit("series.manage"), create);
router.put("/:id",                 auth, permit("series.manage"), update);
router.delete("/:id",              auth, permit("series.manage"), remove);
router.post("/:id/ranges",         auth, permit("series.manage"), addRange);
router.delete("/ranges/:rangeId",  auth, permit("series.manage"), removeRange);
router.put("/:id/users",           auth, permit("series.manage"), assignUsers);

module.exports = router;
