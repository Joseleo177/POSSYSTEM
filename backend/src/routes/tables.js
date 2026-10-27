const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const svc = require("../services/tables");

// Mapa de mesas. Va con el interruptor de restaurante (companies.cocina_enabled), el mismo
// de la pantalla de cocina.
const moduloActivo = async (req, res, next) => {
  try {
    const { Company } = require("../models");
    const company = req.company_id ? await Company.findByPk(req.company_id, { attributes: ["cocina_enabled"] }) : null;
    if (!company?.cocina_enabled) {
      return res.status(403).json({ ok: false, message: "El mapa de mesas no está activo para esta empresa" });
    }
    next();
  } catch (err) { next(err); }
};

const handle = (fn) => async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await fn(req)) });
  } catch (err) { next(err); }
};

router.use(auth, moduloActivo);

const ver    = permit("tables.view", "tables.serve", "tables.layout");
const editar = permit("tables.layout");
// Tomar pedidos: abrir la mesa y mandar rondas a cocina. No incluye cobrar.
const servir = permit("tables.serve");

router.get   ("/occupancy",        ver,    handle(req => svc.occupancy(req, req.query)));
router.get   ("/menu/:productId",  ver,    handle(req => svc.dish(req, req.params.productId, req.query)));
router.get   ("/:id/accounts",     ver,    handle(req => svc.accounts(req, req.params.id)));
router.post  ("/:id/rounds",       servir, handle(req => svc.sendRound(req, req.params.id, req.body)));

// Cuentas de la mesa antes de cobrar: cambiar de mesa, juntar, dividir, "pidió la cuenta". Las
// hace el mesonero o la caja; ninguna cobra ni mueve inventario (ver services/mesaCuentas.js).
const cuentas = require("../services/mesaCuentas");
const atender = permit("tables.serve", "sales.create");
router.post  ("/accounts/:saleId/move",  atender, handle(req => cuentas.mover(req, req.params.saleId, req.body)));
router.post  ("/accounts/:saleId/split", atender, handle(req => cuentas.dividir(req, req.params.saleId, req.body)));
router.post  ("/accounts/:saleId/bill",  atender, handle(req => cuentas.pedirCuenta(req, req.params.saleId, req.body)));

router.get   ("/areas",            ver,    handle(req => svc.listAreas(req, req.query)));
router.post  ("/areas",            editar, handle(req => svc.saveArea(req, req.body)));
router.put   ("/areas/:id",        editar, handle(req => svc.saveArea(req, { ...req.body, id: req.params.id })));
router.delete("/areas/:id",        editar, handle(req => svc.deleteArea(req, req.params.id)));
router.put   ("/areas/:id/layout", editar, handle(req => svc.saveLayout(req, req.params.id, req.body)));

module.exports = router;
