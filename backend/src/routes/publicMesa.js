const router    = require("express").Router();
const rateLimit = require("express-rate-limit");
const svc = require("../services/mesaPublica");

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

router.get ("/:token",                verLimiter,    handle(req => svc.ver(req.params.token, req.query.v || null)));
router.post("/:token/cuenta",         cuentaLimiter, handle(req => svc.pedirCuenta(req.params.token)));
router.get ("/:token/menu",           verLimiter,    handle(req => svc.menu(req.params.token)));
router.get ("/:token/menu/:productId", verLimiter,   handle(req => svc.adicionales(req.params.token, req.params.productId)));
router.post("/:token/pedido",         pedidoLimiter, handle(req => svc.pedir(req.params.token, req.body)));

module.exports = router;
