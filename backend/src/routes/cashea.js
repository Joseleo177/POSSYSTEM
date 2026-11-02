const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const cashea = require("../services/cashea");
const { broadcast } = require("../services/sseService");

// Ventas con Cashea (ver services/cashea). La opción de la empresa la revisa el servicio.
const handle = (fn, status = 200) => async (req, res) => {
  try {
    const data = await fn(req);
    res.status(status).json({ ok: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
};

// Lo financiado de una venta: desde la caja, con el mismo permiso que cobrar.
router.post("/sales/:id", auth, permit("sales.create"), handle(async (req) => {
  const data = await cashea.registrarVenta(parseInt(req.params.id), req.body, req);
  broadcast(req.employee?.company_id ?? 0, "sales:updated", { id: parseInt(req.params.id) });
  return data;
}, 201));

router.get("/pending", auth, permit("accounting.view"), handle((req) => cashea.pendientes(req)));
router.get("/settlements", auth, permit("accounting.view"), handle((req) => cashea.liquidaciones(req, { limit: req.query.limit })));
router.post("/settlements", auth, permit("accounting.income"), handle((req) => cashea.liquidar(req.body, req), 201));
router.delete("/settlements/:id", auth, permit("accounting.void"), handle((req) => cashea.anularLiquidacion(parseInt(req.params.id))));

module.exports = router;
