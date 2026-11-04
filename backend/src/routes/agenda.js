const router = require("express").Router();
const { auth, permit } = require("../middleware/auth");
const svc = require("../services/agenda");

// Agenda de citas: un extra que el superusuario enciende por empresa (companies.citas_enabled).
// Sin él, ninguna ruta responde aunque el rol tenga los permisos.
//
// Las rutas de lectura y de atender citas no llevan `permit`: el barbero enlazado a un recurso ve
// y atiende lo suyo sin permisos de la agenda, y eso lo decide el servicio (alcance). Configurar
// pide agenda.setup y cobrar pide sales.create.
const moduloActivo = async (req, res, next) => {
  try {
    const { Company } = require("../models");
    const company = req.company_id ? await Company.findByPk(req.company_id, { attributes: ["citas_enabled"] }) : null;
    if (!company?.citas_enabled) {
      return res.status(403).json({ ok: false, message: "La agenda de citas no está activa para esta empresa" });
    }
    next();
  } catch (err) { next(err); }
};

router.use(auth, moduloActivo);

// Como en routes/commissions.js, más el `code` del error: la pantalla distingue "ocupado"
// (ofrece agendar igual) de los demás errores.
const enviar = (fn) => async (req, res, next) => {
  try { res.json({ ok: true, ...(await fn(req)) }); }
  catch (err) {
    if (err.isOperational) return res.status(err.status || 400).json({ ok: false, message: err.message, ...(err.code ? { code: err.code } : {}) });
    next(err);
  }
};
const id = (req) => parseInt(req.params.id, 10);

// ── El día ──
router.get("/day",       enviar(async (req) => svc.dia(req, req.query)));
router.get("/slots",     enviar(async (req) => ({ data: await svc.slots(req, req.query) })));
router.get("/products",  enviar(async (req) => ({ data: await svc.productos(req, req.query) })));

// ── Citas ──
router.get("/appointments/:id",          enviar(async (req) => ({ data: await svc.una(req, id(req)) })));
router.post("/appointments",             enviar(async (req) => ({ data: await svc.crear(req, req.body) })));
router.put("/appointments/:id",          enviar(async (req) => ({ data: await svc.editar(req, id(req), req.body) })));
router.post("/appointments/:id/status",  enviar(async (req) => ({ data: await svc.cambiarEstado(req, id(req), String(req.body?.status || "")) })));
router.post("/appointments/:id/finish",  enviar(async (req) => ({ data: await svc.terminar(req, id(req), req.body) })));
router.post("/appointments/:id/charge",  permit("sales.create"), enviar(async (req) => ({ data: await svc.prepararCobro(req, id(req), req.body) })));
router.get("/customers/:id/appointments", permit("agenda.view", "agenda.book", "customers.view"), enviar(async (req) => ({ data: await svc.deCliente(req, id(req)) })));

// ── Configuración ──
router.get("/resources",          enviar(async (req) => ({ data: await svc.listar(req, parseInt(req.query.warehouse_id, 10), { all: req.query.all === "1" }) })));
router.post("/resources",         permit("agenda.setup"), enviar(async (req) => ({ data: await svc.guardar(req, null, req.body) })));
router.put("/resources/:id",      permit("agenda.setup"), enviar(async (req) => ({ data: await svc.guardar(req, id(req), req.body) })));
router.put("/resources/:id/hours", permit("agenda.setup"), enviar(async (req) => ({ data: await svc.guardarHorario(req, id(req), req.body?.hours) })));
router.get("/resources/:id/blocks", enviar(async (req) => ({ data: await svc.listarAusencias(req, id(req)) })));
router.post("/resources/:id/blocks", permit("agenda.setup", "agenda.book"), enviar(async (req) => ({ data: await svc.crearAusencia(req, id(req), req.body) })));
router.delete("/blocks/:id",      permit("agenda.setup", "agenda.book"), enviar(async (req) => ({ data: await svc.borrarAusencia(req, id(req)) })));
router.get("/services",           enviar(async (req) => ({ data: await svc.listarServicios(req, parseInt(req.query.warehouse_id, 10), { all: req.query.all === "1" }) })));
router.put("/services/:id",       permit("agenda.setup"), enviar(async (req) => ({ data: await svc.guardarServicio(req, id(req), req.body) })));
router.get("/settings",           enviar(async (req) => ({ data: await svc.leerAjustes(req) })));
router.put("/settings",           permit("agenda.setup"), enviar(async (req) => ({ data: await svc.guardarAjustes(req, req.body) })));
router.get("/location",           enviar(async (req) => ({ data: await svc.leerUbicacion(req, req.query.warehouse_id) })));
router.put("/location",           permit("agenda.setup"), enviar(async (req) => ({ data: await svc.guardarUbicacion(req, req.body) })));
router.get("/setup/options",      permit("agenda.setup"), enviar(async (req) => ({ data: await svc.opcionesConfig(req) })));

module.exports = router;
