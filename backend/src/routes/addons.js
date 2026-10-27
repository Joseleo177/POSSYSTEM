const router = require("express").Router();
const { auth, permit, assertWarehouseAccess } = require("../middleware/auth");
const svc = require("../services/addons");

// Adicionales de los platos (Catálogo → Adicionales). Van con el interruptor de restaurante
// (companies.cocina_enabled), como las mesas y la cocina. Se configuran con los permisos del
// catálogo: un adicional con precio es un producto más.
const moduloActivo = async (req, res, next) => {
  try {
    const { Company } = require("../models");
    const company = req.company_id ? await Company.findByPk(req.company_id, { attributes: ["cocina_enabled"] }) : null;
    if (!company?.cocina_enabled) {
      return res.status(403).json({ ok: false, message: "Los adicionales no están activos para esta empresa" });
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

// La cocina también los ve: desde su pantalla marca lo que se acabó.
router.get   ("/",    permit("products.view", "kitchen.manage"), handle(() => svc.listGroups()));
// Los adicionales de un plato, para la caja y el mesonero (con el precio y la existencia de la sucursal).
router.get   ("/product/:id", permit("sales.create", "tables.serve", "products.view"), handle(async (req) => {
  const wid = parseInt(req.query.warehouse_id, 10) || null;
  if (wid) await assertWarehouseAccess(req, wid);
  return { data: await svc.forProduct(req.params.id, wid) };
}));
router.patch ("/options/:id", permit("products.edit", "kitchen.manage"), handle(req => svc.setSoldOut(req, req.params.id, req.body?.sold_out)));
router.post  ("/",    permit("products.edit"), handle(req => svc.saveGroup(req, req.body)));
router.put   ("/:id", permit("products.edit"), handle(req => svc.saveGroup(req, { ...req.body, id: req.params.id })));
router.delete("/:id", permit("products.edit"), handle(req => svc.deleteGroup(req, req.params.id)));

module.exports = router;
