const router    = require("express").Router();
const rateLimit = require("express-rate-limit");
const svc = require("../services/mesaPublica");
const clientes = require("../services/mesaClientes");

// Página del QR de la mesa: responde sin sesión, por el código secreto de la mesa. La página se
// refresca sola cada 15 s y en un restaurante muchos teléfonos salen por la MISMA IP (el wifi
// del local), así que el límite de lectura es amplio; pedir la cuenta lleva uno estricto.
const verLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes." },
});
const cuentaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Ya avisamos. Espera un momento." },
});

const handle = (fn) => async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await fn(req)) });
  } catch (err) { next(err); }
};

// Pedir desde el QR. Todo el local sale por la misma IP: el tope de pedidos es por IP pero
// holgado; el que frena el abuso es el de pedidos pendientes por mesa (ver mesaPublica.pedir).
const pedidoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiados pedidos seguidos. Espera un momento." },
});

// Quién es el cliente (services/mesaClientes.js). Identificar responde con el nombre de pila de
// quien acierte una cédula, como el catálogo: el tope estricto es lo que frena recorrer cédulas.
const identificarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiados intentos. Espera unos minutos." },
});

router.get ("/:token/yo",             verLimiter,         handle(req => clientes.quien(req.params.token, req.query.d)));
router.post("/:token/yo",             cuentaLimiter,      handle(req => clientes.confirmar(req.params.token, req.body?.device, req.body?.yes === true)));
router.post("/:token/identificar",    identificarLimiter, handle(req => clientes.identificar(req.params.token, req.body?.device, req.body?.document)));
router.get ("/:token",                verLimiter,    handle(req => svc.ver(req.params.token, req.query.v || null)));
router.post("/:token/cuenta",         cuentaLimiter, handle(req => svc.pedirCuenta(req.params.token)));
router.get ("/:token/menu",           verLimiter,    handle(req => svc.menu(req.params.token)));
router.get ("/:token/menu/:productId", verLimiter,   handle(req => svc.adicionales(req.params.token, req.params.productId)));
router.post("/:token/pedido",         pedidoLimiter, handle(req => svc.pedir(req.params.token, req.body)));

module.exports = router;
