const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const { crearAvance } = require("../services/cashAdvances");
const { broadcast } = require("../services/sseService");

// Avance de efectivo suelto, sin venta (con venta va dentro del cobro: payments, `cash_advance`).
// El permiso propio (sales.advance) y la opción de la empresa los revisa el servicio, leyendo
// los permisos de la base y no del token, igual que los descuentos.
router.post("/", auth, permit("sales.create"), async (req, res) => {
  try {
    const data = await crearAvance(req.body, req);
    broadcast(req.employee?.company_id ?? 0, "sales:updated", {});
    res.status(201).json({ ok: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, message: err.message });
  }
});

module.exports = router;
