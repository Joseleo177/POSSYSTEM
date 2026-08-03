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
    const { search, category_id, limit, offset } = req.query;
    const data = await svc.getProducts(req.params.token, { search, category_id, limit, offset });
    if (!data) return res.status(404).json({ ok: false, message: "Catálogo no disponible" });
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[public-catalog]", err.message);
    res.status(500).json({ ok: false, message: "Error al cargar los productos" });
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