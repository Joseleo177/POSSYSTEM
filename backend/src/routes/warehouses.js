const router   = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const wh       = require("../controllers/warehouses");

router.use(auth);

// ── Almacenes ─────────────────────────────────────────────────
router.get   ("/",                   wh.getAll);
router.post  ("/",                   permit("admin", "config"), wh.create);
router.put   ("/:id",                permit("admin", "config"), wh.update);
router.delete("/:id",                permit("admin"),           wh.remove);

// ── Stock ─────────────────────────────────────────────────────
router.get  ("/:id/stock",           wh.getStock);
router.post ("/:id/stock",           permit("inventory", "admin", "config"), wh.addStock);
router.put  ("/:id/stock/:productId",permit("inventory", "admin", "config"), wh.setStock);
router.delete("/:id/stock/:productId",permit("admin", "config"), wh.removeStock);
router.get  ("/:id/products",        wh.getProducts);

// ── Empleados por almacén ─────────────────────────────────────
router.get  ("/employee/:employeeId", wh.getByEmployee);
router.put  ("/:id/employees",        permit("admin", "config"), wh.assignEmployees);

// ── Transferencias ────────────────────────────────────────────
router.post ("/transfer",            permit("inventory", "admin", "config"), wh.transfer);
router.get  ("/transfers",           wh.getTransfers);

module.exports = router;