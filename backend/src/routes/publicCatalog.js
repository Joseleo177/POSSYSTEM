const router    = require("express").Router();
const crypto    = require("crypto");
const rateLimit = require("express-rate-limit");
const { Setting } = require("../models");
const { runWithoutTenant } = require("../utils/tenantStorage");
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
router.get("/:slug", publicLimiter, async (req, res) => {
  try {
    const data = await svc.getStore(req.params.slug);
    // Mismo 404 para tienda inexistente y para catálogo desactivado: no se distingue
    // "no existe" de "existe pero no publica", que es información del comercio.
    if (!data) return res.status(404).json({ ok: false, message: "Catálogo no disponible" });
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[public-catalog]", err.message);
    res.status(500).json({ ok: false, message: "Error al cargar el catálogo" });
  }
});

router.get("/:slug/products", publicLimiter, async (req, res) => {
  try {
    // warehouse_id: la sucursal que eligió el cliente. Define qué existencias ve.
    const { search, category_id, limit, offset, warehouse_id } = req.query;
    const data = await svc.getProducts(req.params.slug, { search, category_id, limit, offset, warehouse_id });
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

router.post("/:slug/identify", identifyLimiter, async (req, res) => {
  try {
    const data = await svc.identifyCustomer(req.params.slug, req.body?.document);
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

router.get("/:slug/my-orders", myOrdersLimiter, async (req, res) => {
  try {
    const data = await svc.getMyOrders(req.params.slug, req.query.document);
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

router.post("/:slug/orders", orderLimiter, async (req, res) => {
  try {
    const data = await svc.createOrder(req.params.slug, req.body || {});
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

// El slug se deriva del nombre de la tienda, pero se guarda: si el comercio se renombra, el
// enlace publicado NO cambia solo. Cambiarlo rompe todo lo que ya se repartió por WhatsApp,
// así que es una decisión del comercio (botón "Actualizar enlace"), no un efecto colateral
// de editar la ficha. `suggested` es lo que le correspondería hoy, para poder avisarlo.
async function currentAndSuggested() {
  const [slugRow, nameRow] = await Promise.all([
    Setting.findOne({ where: { key: svc.SLUG_KEY } }),
    Setting.findOne({ where: { key: "store_name" } }),
  ]);
  return {
    slug: slugRow?.value || null,
    suggested: svc.slugify(nameRow?.value) || null,
  };
}

// Dos empresas pueden llamarse igual, y el slug es la dirección pública: tiene que ser único
// en toda la instalación, no por empresa. Se busca la variante libre añadiendo -2, -3...
//
// La consulta corre sin el filtro de empresa a propósito: justamente hay que ver si OTRA se
// quedó con ese nombre. No expone nada —solo responde si el slug está tomado.
async function uniqueSlug(base, company_id) {
  const taken = await runWithoutTenant(() =>
    Setting.findAll({ where: { key: svc.SLUG_KEY }, attributes: ["value", "company_id"] })
  );
  const usedByOthers = new Set(
    taken.filter((r) => r.company_id !== company_id).map((r) => String(r.value))
  );
  if (!usedByOthers.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`.slice(0, 60).replace(/-+$/, "");
    if (!usedByOthers.has(candidate)) return candidate;
  }
  // Salida de emergencia: 99 tiendas homónimas. Antes que fallar, un sufijo aleatorio corto.
  return `${base}-${crypto.randomBytes(2).toString("hex")}`;
}

adminRouter.get("/", auth, permit("config"), async (_req, res) => {
  res.json({ ok: true, data: await currentAndSuggested() });
});

// Crea o actualiza el enlace a partir del nombre actual de la tienda. Llamarlo cuando el
// nombre cambió reemplaza el enlace: el anterior deja de resolver en el acto, porque la
// búsqueda es por valor exacto.
adminRouter.post("/", auth, permit("config"), async (req, res) => {
  const nameRow = await Setting.findOne({ where: { key: "store_name" } });
  const base = svc.slugify(nameRow?.value);
  if (!svc.isValidSlug(base)) {
    return res.status(400).json({
      ok: false,
      message: "El nombre de la tienda no sirve para armar un enlace. Ponle un nombre con letras o números en Configuración.",
    });
  }

  const slug = await uniqueSlug(base, req.company_id);
  await Setting.upsert({ key: svc.SLUG_KEY, value: slug, company_id: req.company_id });
  res.json({ ok: true, data: { slug, suggested: base } });
});

adminRouter.delete("/", auth, permit("config"), async (_req, res) => {
  await Setting.destroy({ where: { key: svc.SLUG_KEY } });
  res.json({ ok: true, message: "Catálogo público desactivado" });
});

module.exports = { publicRouter: router, adminRouter };