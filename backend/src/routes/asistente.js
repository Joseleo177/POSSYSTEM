const router = require("express").Router();
const { auth, permit, superuser } = require("../middleware/auth");
const svc = require("../services/asistente");
const config = require("../services/asistente/config");

// Asistente con IA: un extra que el superusuario enciende por empresa (companies.
// asistente_enabled). Quién lo usa lo decide la tienda con assistant.use; lo que puede consultar,
// los demás permisos de cada persona (ver services/asistente/herramientas.js).

const enviar = (fn) => async (req, res, next) => {
  try { res.json({ ok: true, ...(await fn(req)) }); }
  catch (err) {
    if (err.isOperational) return res.status(err.status || 400).json({ ok: false, message: err.message });
    next(err);
  }
};

const conEmpresa = (req, res, next) => {
  if (!req.company_id) return res.status(400).json({ ok: false, message: "Asta trabaja por empresa: entra con un usuario de la tienda." });
  next();
};

// Consumo de todas las empresas este mes (Empresas, superusuario). Va antes del filtro de
// empresa: el superusuario no tiene una.
router.get("/consumo", auth, superuser, enviar(async () => ({ data: await svc.consumoPorEmpresa() })));

// Llave y modelo del proveedor (Configuración → Asistente IA). Es de la plataforma, no de una
// empresa: solo el superusuario. La llave nunca vuelve a la pantalla, solo sus 4 últimos.
router.get("/config", auth, superuser, enviar(async () => ({ data: await config.estadoPublico() })));
router.put("/config", auth, superuser, enviar(async (req) => ({ data: await config.guardar(req.body || {}) })));
router.post("/config/probar", auth, superuser, enviar(async () => ({ data: await config.probar() })));

// Cupo del mes, para el pie del chat.
router.get("/estado", auth, conEmpresa, permit("assistant.use"), enviar(async (req) => ({ data: await svc.estado(req.company_id) })));

router.post("/preguntar", auth, conEmpresa, permit("assistant.use"), enviar(async (req) => ({ data: await svc.preguntar(req, req.body || {}) })));

module.exports = router;
