const express = require("express");
const router  = express.Router();
const { auth, permit } = require("../middleware/auth");
const { getAll, getMy, create, update, remove, addRange, removeRange, assignUsers } = require("../controllers/series");

router.get("/my",                  auth, getMy);
router.get("/",                    auth, permit("config"), getAll);
router.post("/",                   auth, permit("config"), create);
router.put("/:id",                 auth, permit("config"), update);
router.delete("/:id",              auth, permit("config"), remove);
router.post("/:id/ranges",         auth, permit("config"), addRange);
router.delete("/ranges/:rangeId",  auth, permit("config"), removeRange);
router.put("/:id/users",           auth, permit("config"), assignUsers);

module.exports = router;
