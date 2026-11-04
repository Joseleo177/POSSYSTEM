const router = require("express").Router();
const { auth, permit, hasPermission } = require("../middleware/auth");
const svc = require("../services/cobranza");

// Cobranza por sectores: un extra que el superusuario enciende por empresa
// (companies.cobranza_enabled). Sin él, ninguna ruta responde aunque el rol tenga los permisos.
const moduloActivo = async (req, res, next) => {
  try {
    const { Company } = require("../models");
    const company = req.company_id ? await Company.findByPk(req.company_id, { attributes: ["cobranza_enabled"] }) : null;
    if (!company?.cobranza_enabled) {
      return res.status(403).json({ ok: false, message: "La cobranza por sectores no está activa para esta empresa" });
    }
    next();
  } catch (err) { next(err); }
};

router.use(auth, moduloActivo);

const enviar = (fn, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ ok: true, ...(await fn(req)) }); }
  catch (err) {
    if (err.isOperational || (err.status && err.status < 500)) return res.status(err.status || 400).json({ ok: false, message: err.message });
    next(err);
  }
};

const VER = ["cobranza.view", "cobranza.manage"];

router.get ("/sectores",        permit(...VER),             enviar(req => svc.listarSectores(req, {
  incluirInactivos: req.query.all === "1",
  gestion: req.query.all === "1" && hasPermission(req.employee?.permissions, "cobranza.manage"),
})));
router.post("/sectores",        permit("cobranza.manage"),  enviar(req => svc.guardarSector(req, null, req.body), 201));
router.put ("/sectores/:id",    permit("cobranza.manage"),  enviar(req => svc.guardarSector(req, req.params.id, req.body)));
router.put ("/asignar",         permit("cobranza.manage"),  enviar(req => svc.asignarClientes(req, req.body || {})));
router.get ("/config",          permit(...VER),             enviar(req => svc.leerConfig(req, { conCategorias: hasPermission(req.employee?.permissions, "cobranza.manage") })));
router.put ("/config",          permit("cobranza.manage"),  enviar(req => svc.guardarConfig(req, req.body || {})));
router.get ("/productos",       permit("cobranza.manage"),  enviar(req => svc.buscarProductos(req, req.query.search)));
router.get ("/clientes",        permit(...VER),             enviar(req => svc.listarClientes(req, req.query)));
router.get ("/clientes/:id",    permit(...VER),             enviar(req => svc.fichaCliente(req, req.params.id)));
router.post("/clientes/:id/bolsas", permit("cobranza.leave"),   enviar(req => svc.dejarBolsa(req, req.params.id, req.body || {}), 201));
router.post("/clientes/:id/abonos", permit("cobranza.collect"), enviar(req => svc.abonar(req, req.params.id, req.body || {}), 201));

// Regalos (services/cobranza/regalos): apartar, entregar y anular, con su inventario.
const regalos = require("../services/cobranza/regalos");
router.get ("/clientes/:id/regalos/opciones", permit("cobranza.gifts"), enviar(req => regalos.opciones(req, req.params.id)));
router.post("/clientes/:id/regalos", permit("cobranza.gifts"),  enviar(req => regalos.asignar(req, req.params.id, req.body || {}), 201));
router.get ("/regalos",              permit(...VER),            enviar(req => regalos.listar(req, req.query)));
router.post("/regalos/:id/entregar", permit("cobranza.gifts"),  enviar(req => regalos.entregar(req, req.params.id)));
router.post("/regalos/:id/anular",   permit("cobranza.gifts", "cobranza.manage"), enviar(req => regalos.anular(req, req.params.id, req.body || {})));

module.exports = router;
