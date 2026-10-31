const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const svc = require("../services/webOrders");
const { Company } = require("../models");

// Módulo Pedidos: la bandeja de los pedidos del catálogo, para toda empresa con el catálogo
// público (no hace falta el extra de pedidos web: ese agrega delivery por zonas y pagos
// reportados). Atenderlos es trabajo de caja (aceptar los pasa al POS), así que todo va con
// sales.create.

const handle = (fn) => async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await fn(req)) });
  } catch (err) { next(err); }
};

const moduloActivo = async (req, res, next) => {
  try {
    const c = req.company_id ? await Company.findByPk(req.company_id, { attributes: ["catalog_enabled"] }) : null;
    if (!c?.catalog_enabled) {
      return res.status(403).json({ ok: false, message: "El catálogo público no está activo para esta empresa" });
    }
    next();
  } catch (err) { next(err); }
};

router.use(auth, moduloActivo, permit("sales.create"));

router.get ("/",            handle(req => svc.list(req, req.query)));
router.get ("/:id",         handle(req => svc.detail(req, req.params.id)));
router.put ("/:id/charges", handle(req => svc.ajustar(req, req.params.id, req.body)));
router.post("/:id/accept",  handle(req => svc.aceptar(req, req.params.id, req.body)));
router.post("/:id/stage",   handle(req => svc.avanzar(req, req.params.id, req.body)));
router.post("/:id/reject",  handle(req => svc.rechazar(req, req.params.id, req.body)));

module.exports = router;
