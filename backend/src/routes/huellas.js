const router = require("express").Router();
const { auth, assertWarehouseAccess } = require("../middleware/auth");
const { huellasCaja, QUE } = require("../services/huellaCaja");

// GET /api/huellas?warehouse_id=7&que=productos,cuentas,promos,monedas
// → { ok, data: { productos: "<md5>", cuentas: "<md5>", ... } }
//
// Solo dice si algo cambió; los datos se piden por sus rutas de siempre, que conservan sus
// permisos. Aun así la sucursal se valida: la huella de otra tienda delataría su movimiento.
router.get("/", auth, async (req, res, next) => {
  try {
    if (!req.company_id) return res.status(400).json({ ok: false, message: "Selecciona una empresa" });
    const que = String(req.query.que || QUE.join(",")).split(",");
    const wid = req.query.warehouse_id;
    if (wid) await assertWarehouseAccess(req, wid);
    const data = await huellasCaja({ companyId: req.company_id, warehouseId: wid, que });
    // Que ningún intermediario guarde la respuesta: una huella vieja es justo lo que se evita.
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, message: err.message });
    next(err);
  }
});

module.exports = router;
