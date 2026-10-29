const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const svc = require("../services/paymentReports");
const { moduloActivo: moduloEmpresa } = require("../services/catalogCheckout");

// Pagos que los clientes reportan desde el catálogo. Verlos es parte de atender el pedido (la
// caja ve si ya pagó); confirmarlos o rechazarlos es decir que el dinero está o no en el banco,
// y eso pide accounting.confirm. Registrarlo como cobro es cobrar: sales.create.
const handle = (fn, status = 200) => async (req, res, next) => {
  try {
    const out = await fn(req);
    res.status(status).json({ ok: true, ...out });
  } catch (err) { next(err); }
};

// Extra por empresa (companies.pedidos_web_enabled): sin él, ninguna ruta responde.
const moduloActivo = async (req, res, next) => {
  try {
    if (!req.company_id || !(await moduloEmpresa(req.company_id))) {
      return res.status(403).json({ ok: false, message: "Los pedidos web no están activos para esta empresa" });
    }
    next();
  } catch (err) { next(err); }
};

router.use(auth, moduloActivo);

router.get ("/",            permit("sales.create", "accounting.confirm"), handle(req => svc.list(req, req.query)));
router.post("/:id/confirm", permit("accounting.confirm"),                 handle(req => svc.confirm(req, req.params.id)));
router.post("/:id/reject",  permit("accounting.confirm"),                 handle(req => svc.reject(req, req.params.id, req.body)));
router.post("/:id/apply",   permit("sales.create"),                       handle(async req => ({ data: await svc.aplicar(req, req.params.id) })));

module.exports = router;
