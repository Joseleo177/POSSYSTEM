require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const morgan   = require("morgan");
const path     = require("path");

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middlewares ─────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ── Public routes ────────────────────────────────────────────
app.use("/api/auth",       require("./routes/auth"));

// ── Protected routes ─────────────────────────────────────────
const { auth } = require("./middleware/auth");

app.use("/api/products",         auth, require("./routes/products"));
app.use("/api/sales",            auth, require("./routes/sales"));
app.use("/api/categories",       auth, require("./routes/categories"));
app.use("/api/customers",        auth, require("./routes/customers"));
app.use("/api/employees",        require("./routes/employees"));        // auth dentro
app.use("/api/currencies",       require("./routes/currencies"));       // auth dentro
app.use("/api/settings",         require("./routes/settings"));         // auth dentro
app.use("/api/payment-journals", require("./routes/paymentJournals"));  // auth dentro
app.use("/api/purchases",        require("./routes/purchases"));        // auth dentro
app.use("/api/warehouses",       require("./routes/warehouses"));       // auth dentro
app.use("/api/banks",            require("./routes/banks"));            // auth dentro ← NUEVO

// ── Health check ────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ ok: true, service: "pos-backend", uptime: process.uptime() }));

// ── 404 ─────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ ok: false, message: "Ruta no encontrada" }));

// ── Error handler ───────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, message: "Error interno del servidor" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅  Backend POS corriendo en http://0.0.0.0:${PORT}`);
});