const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const svc = require("../services/fiscal/declaracionIva");

// Declaración de IVA del período (forma 30). Se ve con los reportes; calcularla, presentarla y
// marcarla pagada es del administrador: lo que se declara al SENIAT no lo cambia cualquiera.
// Ver services/fiscal/declaracionIva.js.

const wrap = (fn) => async (req, res) => {
  try {
    res.json({ ok: true, data: await fn(req) });
  } catch (err) {
    if (!err.isOperational) console.error(err);
    res.status(err.isOperational ? err.status || 400 : 500)
      .json({ ok: false, message: err.isOperational ? err.message : "Error en la declaración de IVA" });
  }
};

router.use(auth);

router.get("/",                permit("reports.view"), wrap(req => svc.listar(req)));
router.post("/",               permit("admin"), wrap(req => svc.crear(req.body || {}, req)));
router.post("/:id/calcular",   permit("admin"), wrap(req => svc.calcular(req.params.id, req)));
router.patch("/:id",           permit("admin"), wrap(req => svc.editar(req.params.id, req.body || {}, req)));
router.post("/:id/declarar",   permit("admin"), wrap(req => svc.declarar(req.params.id, req)));
router.post("/:id/borrador",   permit("admin"), wrap(req => svc.volverBorrador(req.params.id, req)));
router.post("/:id/pago",       permit("admin"), wrap(req => svc.marcarPago(req.params.id, req.body || {}, req)));
router.delete("/:id",          permit("admin"), wrap(req => svc.eliminar(req.params.id, req)));

module.exports = router;
