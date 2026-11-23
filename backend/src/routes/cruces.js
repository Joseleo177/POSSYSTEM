const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const svc = require("../services/cruces");

// Cruce de cuentas con proveedores (services/cruces). Ver el estado lo puede quien ve contactos;
// cruzar, anular y registrar al proveedor como cliente piden el permiso especial customers.cross.

const enviar = (fn) => async (req, res, next) => {
  try { res.json({ ok: true, data: await fn(req) }); }
  catch (err) {
    if (err.isOperational || (err.status && err.status < 500)) return res.status(err.status || 400).json({ ok: false, message: err.message });
    next(err);
  }
};
const conEmpresa = (req, res, next) => {
  if (!req.company_id) return res.status(400).json({ ok: false, message: "Entra con un usuario de la tienda para cruzar cuentas." });
  next();
};

router.use(auth, conEmpresa);
// Lista de todos los cruces (Contabilidad → Cuentas → Cruces): quien cruza, o quien ve las
// cuentas de los dos lados.
router.get("/", permit("customers.cross", "accounting.view", "purchases.view"), enviar(req => svc.listar(req, req.query)));
router.get("/contacto/:id", permit("customers.view"), enviar(req => svc.estado(req, req.params.id)));
router.post("/contacto/:id/como-cliente", permit("customers.cross"), enviar(req => svc.registrarComoCliente(req, req.params.id)));
router.post("/", permit("customers.cross"), enviar(req => svc.cruzar(req, req.body || {})));
router.post("/:id/anular", permit("customers.cross"), enviar(req => svc.anular(req, req.params.id)));

module.exports = router;
