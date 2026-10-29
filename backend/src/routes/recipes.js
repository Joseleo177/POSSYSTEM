const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const svc = require("../services/recipes");

// App Recetas: fichas técnicas de los platos, con su costo y food cost. Va con el interruptor
// de restaurante (companies.cocina_enabled), como la cocina, las mesas y los adicionales. Se
// trabaja con los permisos del catálogo: la receta es parte del producto.
const moduloActivo = async (req, res, next) => {
  try {
    const { Company } = require("../models");
    const company = req.company_id ? await Company.findByPk(req.company_id, { attributes: ["cocina_enabled"] }) : null;
    if (!company?.cocina_enabled) {
      return res.status(403).json({ ok: false, message: "Recetas no está activo para esta empresa" });
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

router.get   ("/",            permit("products.view"), handle(req => svc.list(req, req.query)));
// La cocina también busca insumos: al registrar una olla anota lo que le echó de más.
router.get   ("/ingredients", permit("products.view", "production.manage"), handle(req => svc.ingredients(req, req.query)));
router.post  ("/ingredients", permit("products.edit"), handle(req => svc.createIngredient(req, req.body)));
router.get   ("/:id",         permit("products.view"), handle(req => svc.getOne(req, req.params.id, req.query)));
router.put   ("/:id",         permit("products.edit"), handle(req => svc.save(req, req.params.id, req.body)));
router.delete("/:id",         permit("products.edit"), handle(req => svc.remove(req, req.params.id)));

module.exports = router;
