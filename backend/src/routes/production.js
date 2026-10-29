const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const svc = require("../services/production");

// Producción de cocina (app Recetas): preparaciones por tanda y las tandas hechas (OP-0001).
// Va con el interruptor de restaurante (companies.cocina_enabled). La ficha de la preparación
// se edita con los permisos del catálogo; registrar y anular tandas, con production.manage,
// que también tiene la cocina (lo registra desde su pantalla).
const moduloActivo = async (req, res, next) => {
  try {
    const { Company } = require("../models");
    const company = req.company_id ? await Company.findByPk(req.company_id, { attributes: ["cocina_enabled"] }) : null;
    if (!company?.cocina_enabled) {
      return res.status(403).json({ ok: false, message: "La producción de cocina no está activa para esta empresa" });
    }
    next();
  } catch (err) { next(err); }
};

const handle = (fn) => async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await fn(req)) });
  } catch (err) { next(err); }
};

const VER = ["products.view", "production.view", "production.manage"];

router.use(auth, moduloActivo);

router.get   ("/preparations",          permit(...VER),            handle(req => svc.listPreparations(req, req.query)));
router.get   ("/preparations/:id",      permit(...VER),            handle(req => svc.getPreparation(req, req.params.id, req.query)));
router.post  ("/preparations",          permit("products.edit"),   handle(req => svc.createPreparation(req, req.body)));
router.put   ("/preparations/:id",      permit("products.edit"),   handle(req => svc.savePreparation(req, req.params.id, req.body)));
router.delete("/preparations/:id",      permit("products.edit"),   handle(req => svc.removePreparation(req, req.params.id)));

router.get   ("/batches",               permit(...VER),            handle(req => svc.listBatches(req, req.query)));
router.get   ("/batches/:id",           permit(...VER),            handle(req => svc.getBatch(req, req.params.id)));
router.post  ("/batches",               permit("production.manage"), handle(req => svc.createBatch(req, req.body)));
router.post  ("/batches/:id/annul",     permit("production.manage"), handle(req => svc.annulBatch(req, req.params.id)));

module.exports = router;
