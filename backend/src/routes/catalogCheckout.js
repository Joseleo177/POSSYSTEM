const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const svc = require("../services/catalogCheckout");

// Configuración → Pedidos web: entrega (retiro, delivery por distancia) y qué métodos de cada cuenta
// se publican en el catálogo para pagar. Es configuración de la tienda, como el enlace público.
const handle = (fn) => async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await fn(req)) });
  } catch (err) { next(err); }
};

// Extra por empresa (companies.pedidos_web_enabled): sin él, ninguna ruta responde.
const moduloActivo = async (req, res, next) => {
  try {
    if (!req.company_id || !(await svc.moduloActivo(req.company_id))) {
      return res.status(403).json({ ok: false, message: "Los pedidos web no están activos para esta empresa" });
    }
    next();
  } catch (err) { next(err); }
};

router.use(auth, moduloActivo);

router.get   ("/",                          permit("config.view"), handle(req => svc.getConfig(req)));
router.put   ("/settings",                  permit("config.edit"), handle(req => svc.saveSettings(req, req.body)));
router.put   ("/methods/:journalId/:code",  permit("config.edit"), handle(req => svc.saveMethod(req, req.params.journalId, req.params.code, req.body)));
router.put   ("/warehouses/:id/location",    permit("config.edit"), handle(req => svc.saveWarehouseLocation(req, req.params.id, req.body)));

module.exports = router;
