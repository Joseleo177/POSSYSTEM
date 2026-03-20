const express = require("express");
const router  = express.Router();
const { auth } = require("../middleware/auth");
const { getAll, getMy, create, update, remove, addRange, removeRange, assignUsers } = require("../controllers/series");

router.get("/my",                  auth, getMy);
router.get("/",                    auth, getAll);
router.post("/",                   auth, create);
router.put("/:id",                 auth, update);
router.delete("/:id",              auth, remove);
router.post("/:id/ranges",         auth, addRange);
router.delete("/ranges/:rangeId",  auth, removeRange);
router.put("/:id/users",           auth, assignUsers);

module.exports = router;
