const router = require("express").Router();
const ctrl   = require("../controllers/dashboard");
const { auth, permit } = require("../middleware/auth");

// Solo "reports": los KPIs que devuelve (facturación, cobranza, saldo en cajas, cuentas por
// cobrar) son información gerencial. Antes bastaba con "sales" y eso dejaba entrar al cajero,
// que veía las cifras del negocio aunque el tab estuviera oculto.
router.get("/", auth, permit("reports.view"), ctrl.getDashboard);

module.exports = router;
