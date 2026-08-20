const router    = require("express").Router();
const crypto    = require("crypto");
const rateLimit = require("express-rate-limit");
const { Setting } = require("../models");
const { auth, permit } = require("../middleware/auth");
const svc = require("../services/publicCatalogService");

// Estas rutas son las únicas del sistema que responden sin token de sesión, así que
// llevan su propio límite: bastante más estricto que el global (20.000/15min), que está
// pensado para cajeros autenticados en LAN, no para internet abierto.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes." },
});

// ── Público (sin autenticación) ───────────────────────────────
router.get("/:token", publicLimiter, async (req, res) => {
  try {
    const data = await svc.getStore(req.params.token);
    // Mismo 404 para token inexistente y para catálogo desactivado: no se le confirma
    // a quien prueba tokens al azar si acertó parcialmente.
    if (!data) return res.status(404).json({ ok: false, message: "Catálogo no disponible" });
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[public-catalog]", err.message);
    res.status(500).json({ ok: false, message: "Error al cargar el catálogo" });
  }
});

router.get("/:token/products", publicLimiter, async (req, res) => {
  try {
    // warehouse_id: la sucursal que eligió el cliente. Define qué existencias ve.
    const { search, category_id, limit, offset, warehouse_id } = req.query;
    const data = await svc.getProducts(req.params.token, { search, category_id, limit, offset, warehouse_id });
    if (!data) return res.status(404).json({ ok: false, message: "Catálogo no disponible" });
    res.json({ ok: true, data });
  } catch (err) {
    // Los errores con status son validaciones y su texto está redactado para el cliente
    // final ("La tienda seleccionada no está disponible"). El resto no se detalla.
    if (err.status) return res.status(err.status).json({ ok: false, message: err.message });
    console.error("[public-catalog]", err.message);
    res.status(500).json({ ok: false, message: "Error al cargar los productos" });
  }
});

// Esta ruta confirma si una cédula tiene ficha y devuelve el nombre. El límite es lo que
// separa "un cliente escribiendo su documento" de "alguien recorriendo cédulas ajenas":
// 20 intentos por cuarto de hora sobran para lo primero y no alcanzan para lo segundo.
const identifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiados intentos. Espera unos minutos." },
});

router.post("/:token/identify", identifyLimiter, async (req, res) => {
  try {
    const data = await svc.identifyCustomer(req.params.token, req.body?.document);
    if (!data) return res.status(404).json({ ok: false, message: "Catálogo no disponible" });
    res.json({ ok: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, message: err.message });
    console.error("[public-catalog:identify]", err.message);
    res.status(500).json({ ok: false, message: "No se pudo verificar el documento" });
  }
});

// Consultar el estado de los pedidos propios. Más holgado que /identify porque es normal
// recargar para ver si ya lo confirmaron, pero sigue acotado: revela historial de compras
// a quien tenga la cédula, igual que la confirmación por nombre.
const myOrdersLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas consultas. Espera unos minutos." },
});

router.get("/:token/my-orders", myOrdersLimiter, async (req, res) => {
  try {
    const data = await svc.getMyOrders(req.params.token, req.query.document);
    if (!data) return res.status(404).json({ ok: false, message: "Catálogo no disponible" });
    res.json({ ok: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, message: err.message });
    console.error("[public-catalog:my-orders]", err.message);
    res.status(500).json({ ok: false, message: "No se pudieron cargar tus pedidos" });
  }
});

// Enviar un pedido crea trabajo real para el comercio, así que va mucho más apretado que
// la simple navegación del catálogo: aquí no hay nada que "recargar" varias veces.
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Has enviado demasiados pedidos. Intenta más tarde." },
});

router.post("/:token/orders", orderLimiter, async (req, res) => {
  try {
    const data = await svc.createOrder(req.params.token, req.body || {});
    if (!data) return res.status(404).json({ ok: false, message: "Catálogo no disponible" });
    res.status(201).json({ ok: true, data });
  } catch (err) {
    // Los errores con status son de validación y su texto está escrito para el cliente
    // final; el resto no se detalla hacia afuera.
    if (err.status) return res.status(err.status).json({ ok: false, message: err.message });
    console.error("[public-catalog:order]", err.message);
    res.status(500).json({ ok: false, message: "No se pudo registrar el pedido" });
  }
});

// ── Administración del enlace (autenticado) ───────────────────
// Va en un router aparte, montado en otra ruta base, para que estos endpoints nunca
// queden colgando del prefijo público por accidente.
const adminRouter = require("express").Router();

adminRouter.get("/", auth, permit("config"), async (_req, res) => {
  const row = await Setting.findOne({ where: { key: svc.TOKEN_KEY } });
  res.json({ ok: true, data: { token: row?.value || null } });
});

// Genera un token nuevo. Llamarlo otra vez revoca el anterior de inmediato: el enlace
// viejo deja de funcionar porque la búsqueda es por valor exacto.
adminRouter.post("/", auth, permit("config"), async (req, res) => {
  const token = crypto.randomBytes(16).toString("hex"); // 32 caracteres, no adivinable
  await Setting.upsert({ key: svc.TOKEN_KEY, value: token, company_id: req.company_id });
  res.json({ ok: true, data: { token } });
});

adminRouter.delete("/", auth, permit("config"), async (_req, res) => {
  await Setting.destroy({ where: { key: svc.TOKEN_KEY } });
  res.json({ ok: true, message: "Enlace desactivado" });
});

module.exports = { publicRouter: router, adminRouter };