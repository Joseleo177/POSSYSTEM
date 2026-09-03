require("dotenv").config();
require("pg"); // Required for Vercel to bundle pg with Sequelize
require("./config/envValidator"); // Joi env validation
const express      = require("express");
const cors         = require("cors");
const path         = require("path");
const rateLimit    = require("express-rate-limit");
const logger       = require("./middleware/logger");
const errorHandler = require("./middleware/errorHandler");
const auditLog     = require("./middleware/auditLog");

const app  = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);

// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
  : ["*"];
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("CORS: origen no permitido"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ── Rate limiting ─────────────────────────────────────────────
// Las cajas de un local pegan contra el backend de su propia red y ahí el tope de intentos
// estorba: un turno entero son miles de requests desde una sola IP.
//
// Los rangos van anclados al inicio a propósito. Con `includes` la comprobación miraba la
// dirección entera, así que cualquier IP pública que contuviera la secuencia se daba por
// LAN y quedaba exenta del límite de login: "85.110.4.7" contiene "10.", y "2001:db8::1234"
// contiene "::1". Eso dejaba la fuerza bruta contra /auth/login sin tope desde fuera.
const LAN_IPV4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;

const isLanIp = (req) => {
  const raw = req.ip || req.connection?.remoteAddress || "";
  if (raw === "::1") return true;                              // loopback IPv6
  const ip = raw.startsWith("::ffff:") ? raw.slice(7) : raw;   // IPv4 mapeada a IPv6
  return LAN_IPV4.test(ip);
};

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX || "20000", 10), // 20,000 req / 15min
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta en 15 minutos." },
  skip: isLanIp,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max: 50,                      // 50 intentos / 15min
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiados intentos de inicio de sesión. Intenta en 15 minutos." },
  skip: isLanIp,
});

// Sirve archivos estáticos (imágenes) antes del rate limiter para no agotar las peticiones
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use(globalLimiter);

// ── Body parsing + logging ────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});
// app.use("/uploads", express.static(path.join(__dirname, "../uploads"))); // Movido arriba

// ── Audit log (mutations) ─────────────────────────────────────
app.use(auditLog);

// ── Public routes ─────────────────────────────────────────────
app.use("/api/auth/login", loginLimiter);   // strict limiter on login
app.use("/api/auth",       require("./routes/auth"));

// Catálogo público: se accede por token, sin sesión. Lleva su propio rate limit y
// resuelve el company_id desde el token (ver services/publicCatalogService.js).
app.use("/api/public/catalog", require("./routes/publicCatalog").publicRouter);

// ── Protected routes ──────────────────────────────────────────
const { auth, permit } = require("./middleware/auth");

app.use("/api/products",         auth, require("./routes/products"));
app.use("/api/sales",            auth, require("./routes/sales"));
app.use("/api/sales",            auth, require("./routes/returns"));   // devoluciones
app.use("/api/categories",       auth, require("./routes/categories"));
app.use("/api/customers",        auth, require("./routes/customers"));
app.use("/api/dashboard",        auth, require("./routes/dashboard"));
app.use("/api/employees",        require("./routes/employees"));        // auth+permit dentro
app.use("/api/currencies",       require("./routes/currencies"));       // auth+permit dentro
app.use("/api/settings",         require("./routes/settings"));         // auth+permit dentro
app.use("/api/payment-journals", require("./routes/paymentJournals"));  // auth dentro
app.use("/api/purchases",         require("./routes/purchases"));        // auth dentro
app.use("/api/purchase-payments", require("./routes/purchasePayments")); // auth dentro
app.use("/api/warehouses",       require("./routes/warehouses"));       // auth dentro
app.use("/api/banks",            require("./routes/banks"));            // auth+permit dentro
app.use("/api/payments",         require("./routes/payments"));         // auth dentro
app.use("/api/series",           require("./routes/series"));           // auth+permit dentro
app.use("/api/reports",          require("./routes/reports"));          // auth dentro
app.use("/api/cash-sessions",    require("./routes/cashSessions"));     // auth dentro
app.use("/api/expenses",         require("./routes/expenses"));          // auth dentro
app.use("/api/companies",        require("./routes/companies"));         // auth+superuser dentro
app.use("/api/quotations",       require("./routes/quotations"));        // auth dentro
app.use("/api/promotions",       require("./routes/promotions"));        // auth dentro
app.use("/api/credit-notes",     require("./routes/creditNotes"));       // auth dentro
app.use("/api/incomes",          require("./routes/incomes"));            // auth dentro
app.use("/api/backup",           require("./routes/backup"));             // auth+config dentro
app.use("/api/catalog-link",     require("./routes/publicCatalog").adminRouter); // auth+config dentro
app.use("/api/catalog-banners",  require("./routes/catalogBanners"));       // auth+config dentro
app.use("/api/benefit-tags",     require("./routes/benefitTags"));          // auth dentro

app.use("/api/events",           require("./routes/events"));             // SSE stream

// ── Health check ──────────────────────────────────────────────
app.get("/health", async (req, res) => {
  try {
    const { sequelize } = require("./models");
    await sequelize.authenticate();
    res.json({ ok: true, service: "pos-backend", db: "connected", uptime: process.uptime() });
  } catch {
    res.status(503).json({ ok: false, service: "pos-backend", db: "disconnected" });
  }
});

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ ok: false, message: "Ruta no encontrada" }));

// ── Centralized error handler ─────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`✅  Backend POS corriendo en http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;