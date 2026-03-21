const router = require("express").Router();
const ctrl   = require("../controllers/returns");
const { auth, permit } = require("../middleware/auth");

// Registrar devolución (requiere al menos permiso de ventas)
router.post ("/:id/return",  auth, permit("sales", "admin", "config"), ctrl.createReturn);
// Ver devoluciones de una venta
router.get  ("/:id/returns", auth, ctrl.getSaleReturns);

module.exports = router;
