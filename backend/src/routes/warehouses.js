const router    = require("express").Router();
const { auth }  = require("../middleware/auth");   // ← destructuring igual que el resto de routes
const wh        = require("../controllers/warehouses");

// Todas las rutas requieren autenticación
router.use(auth);

// ── Almacenes ─────────────────────────────────────────────────
router.get   ("/",                   wh.getAll);
router.post  ("/",                   wh.create);
router.put   ("/:id",                wh.update);
router.delete("/:id",                wh.remove);
router.post("/:id/stock", wh.addStock);
router.get("/:id/products", wh.getProducts);

// ── Stock por almacén ─────────────────────────────────────────
router.get("/:id/stock",             wh.getStock);

// ── Empleados por almacén ─────────────────────────────────────
router.get("/employee/:employeeId",  wh.getByEmployee);
router.put("/:id/employees",         wh.assignEmployees);

// ── Transferencias ────────────────────────────────────────────
router.post("/transfer",             wh.transfer);
router.get ("/transfers",            wh.getTransfers);

module.exports = router;