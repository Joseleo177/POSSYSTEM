const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const c = require("../controllers/kitchen");

// Pantalla de cocina: un extra que el superusuario enciende por empresa
// (companies.cocina_enabled), igual que Fábrica. Sin él, ninguna ruta responde aunque el rol
// tenga los permisos.
const moduloActivo = async (req, res, next) => {
  try {
    const { Company } = require("../models");
    const company = req.company_id ? await Company.findByPk(req.company_id, { attributes: ["cocina_enabled"] }) : null;
    if (!company?.cocina_enabled) {
      return res.status(403).json({ ok: false, message: "La pantalla de cocina no está activa para esta empresa" });
    }
    next();
  } catch (err) { next(err); }
};

router.use(auth, moduloActivo);

router.get  ("/orders",            permit("kitchen.view", "kitchen.manage"), c.board);
router.patch("/orders/:id/status", permit("kitchen.manage"),                 c.setStatus);
// La caja manda a cocina lo que acaba de cobrar (restaurante donde se paga antes de pedir).
router.post ("/sales/:id/ticket",  permit("sales.create"),                   c.fromSale);

module.exports = router;
