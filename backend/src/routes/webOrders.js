const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const svc = require("../services/webOrders");
const { moduloActivo: moduloEmpresa } = require("../services/catalogCheckout");

// Módulo Pedidos: la bandeja de los pedidos del catálogo. Atenderlos es trabajo de caja
// (aceptar los pasa al POS), así que todo va con sales.create, y solo en empresas con el extra
// de pedidos web.
const handle = (fn) => async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await fn(req)) });
  } catch (err) { next(err); }
};

const moduloActivo = async (req, res, next) => {
  try {
    if (!req.company_id || !(await moduloEmpresa(req.company_id))) {
      return res.status(403).json({ ok: false, message: "Los pedidos web no están activos para esta empresa" });
    }
    next();
  } catch (err) { next(err); }
};

router.use(auth, moduloActivo, permit("sales.create"));

router.get ("/",            handle(req => svc.list(req, req.query)));
router.get ("/:id",         handle(req => svc.detail(req, req.params.id)));
router.put ("/:id/charges", handle(req => svc.ajustar(req, req.params.id, req.body)));
router.post("/:id/accept",  handle(req => svc.aceptar(req, req.params.id, req.body)));
router.post("/:id/reject",  handle(req => svc.rechazar(req, req.params.id, req.body)));

module.exports = router;
