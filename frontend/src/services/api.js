import { compressFormData } from "../helpers/compressImage";
import { kvGet, kvSet } from "./offline/store";
import { setOffline } from "./offline/network";

const BASE = (import.meta.env.VITE_API_URL || "") + "/api";

function getToken() {
  return localStorage.getItem("pos_token");
}

// Id del empleado dueño del token, sin ir al servidor. Separa en el equipo lo guardado por
// cada cajero: la sesión de caja o las series de uno no le sirven a otro.
function usuarioDelToken() {
  try {
    const p = getToken()?.split(".")[1];
    return p ? JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))).id ?? null : null;
  } catch { return null; }
}

// Lo que la caja necesita para arrancar. Cada respuesta buena se guarda en el equipo y, si
// después no hay conexión —se fue la luz y la PC volvió sin internet—, se sirve la guardada en
// lugar de fallar: así la caja abre con su sesión, su sucursal, su caja abierta y sus cuentas.
// Solo lecturas, y solo estas: el resto de la app sigue necesitando el servidor.
const GUARDABLES = [
  /^\/auth\/me$/,
  /^\/settings$/,
  /^\/currencies$/,
  /^\/payment-journals$/,
  /^\/banks(\/methods)?$/,
  /^\/categories$/,
  /^\/series\/my\?/,
  /^\/promotions\/active\?/,
  /^\/warehouses\/employee\/\d+$/,
  /^\/cash-sessions\/current\?/,
];

// El login ya trae al empleado y la app no vuelve a pedir /auth/me hasta recargar. Sin esto,
// una caja que entró y se quedó sin internet antes de recargar no tenía sesión guardada.
export function recordarSesion(employee) {
  const uid = usuarioDelToken();
  if (uid && employee) kvSet(`get:${uid}:/auth/me`, { ok: true, employee });
}

// ¿El servidor está sin base de datos? Se pregunta a /ping (que prueba la base) cuando una
// petición falla con un 5xx o tarda demasiado. Hay internet y Vercel responde, pero no puede
// atender: es la caída del 24-09-2026, y para la caja es lo mismo que no tener conexión.
//
// Un 500 corriente —un error de la propia venta— no la dispara: el ping responde bien y el
// error se muestra como siempre. El resultado se recuerda unos segundos para que una ráfaga
// de fallos no lance una ráfaga de pings.
let comprobacion = { t: 0, caido: false, enCurso: null };
function servidorCaido() {
  if (Date.now() - comprobacion.t < 5000) return Promise.resolve(comprobacion.caido);
  if (comprobacion.enCurso) return comprobacion.enCurso;
  comprobacion.enCurso = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try { return !(await fetch(`${BASE}/ping`, { signal: ctrl.signal })).ok; }
    catch { return true; }
    finally { clearTimeout(timer); }
  })().then((caido) => { comprobacion = { t: Date.now(), caido, enCurso: null }; return caido; });
  return comprobacion.enCurso;
}

// Lo que tarde más que esto se da por perdido. Sin tope, con la base congelada la caja
// esperaba lo que Vercel deje vivir a la función: minutos con el cliente delante.
const ESPERA_ARRANQUE_MS = 12_000;

async function request(path, options = {}) {
  const guardable = (options.method || "GET") === "GET" && GUARDABLES.some((re) => re.test(path));
  const uid = guardable ? usuarioDelToken() : null;
  const clave = uid ? `get:${uid}:${path}` : null;
  if (guardable && !options.timeout) options = { ...options, timeout: ESPERA_ARRANQUE_MS };
  try {
    const data = await requestServidor(path, options);
    setOffline(false);
    if (clave && data) kvSet(clave, data);
    return data;
  } catch (err) {
    let sinServidor = err.code === "NETWORK_ERROR";
    if (!sinServidor && path !== "/ping" && (err.status >= 500 || err.code === "TIMEOUT") && await servidorCaido()) {
      sinServidor = true;
      err.code = "SERVER_DOWN";
      err.message = "El servidor no puede atender en este momento: su base de datos no responde.";
    }
    if (sinServidor) {
      setOffline(true);
      const guardada = clave ? await kvGet(clave) : null;
      if (guardada) return guardada;
    } else if (err.code === "TIMEOUT" && clave) {
      // El servidor está bien pero lento (arranque en frío de Vercel, base cargada). Antes de
      // existir el tope la app simplemente esperaba; ahora, si hay copia, se usa la copia en
      // vez de arrancar sin ajustes o sin la caja abierta. La próxima consulta la renueva.
      const guardada = await kvGet(clave);
      if (guardada) return guardada;
    } else if (err.status && path !== "/ping") {
      // Respondió el servidor, aunque sea con un error: hay conexión.
      setOffline(false);
    }
    throw err;
  }
}

let isRefreshing = false;
let refreshPromise = null;
const SIN_RED = Symbol("sin-red");

function buildApiError(status, message, code, data) {
  const err = new Error(message || "Error en la solicitud");
  err.status = status;
  err.code = code;
  err.data = data;
  return err;
}

// Peso total de los archivos de un FormData, para explicar un rechazo por tamaño.
const pesoArchivos = (fd) => [...fd.values()].reduce((s, v) => s + (v instanceof File ? v.size : 0), 0);
const MSG_PESADO = "La imagen pesa demasiado para subirla. Prueba con una más liviana (menos de 4 MB).";

const errorDeRed = () => buildApiError(
  503,
  "No se pudo conectar con el servidor. Revisa tu conexión o intenta de nuevo en unos segundos.",
  "NETWORK_ERROR"
);

async function requestServidor(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  // Toda subida pasa por aquí: se achican las imágenes pesadas antes de mandarlas (ver
  // helpers/compressImage.js — en Vercel una petición de más de 4,5 MB no llega).
  if (isFormData) options = { ...options, body: await compressFormData(options.body) };
  let token = getToken();
  const method = options.method || "GET";
  const headers = {
    ...(isFormData || ["GET", "DELETE"].includes(method) ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  
  // `timeout` (ms) es opcional: corta la espera y la convierte en un error TIMEOUT, que el
  // envoltorio de arriba revisa por si el servidor se quedó sin base.
  const { timeout, ...fetchOptions } = options;
  const ctrl = timeout ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { ...fetchOptions, headers, ...(ctrl ? { signal: ctrl.signal } : {}) });
  } catch (err) {
    if (err.name === "AbortError") {
      throw buildApiError(504, "El servidor tardó demasiado en responder. Intenta de nuevo en unos segundos.", "TIMEOUT");
    }
    if (err.message?.toLowerCase().includes("failed to fetch") || err.name === "TypeError") {
      // Vercel responde 413 sin cabeceras CORS y el navegador lo presenta como un fallo de
      // red. Con una subida pesada, lo probable es eso y no que se cayó la conexión.
      if (isFormData && pesoArchivos(options.body) > 4 * 1024 * 1024) {
        throw buildApiError(413, MSG_PESADO, "PAYLOAD_TOO_LARGE");
      }
      throw errorDeRed();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 413) throw buildApiError(413, MSG_PESADO, "PAYLOAD_TOO_LARGE");

  if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshToken = localStorage.getItem("pos_refresh_token");
    if (refreshToken) {
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        }).then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            localStorage.setItem("pos_token", data.token);
            localStorage.setItem("pos_refresh_token", data.refresh_token);
            return data.token;
          }
          throw new Error("Refresh failed");
        }).catch((err) => {
          // Si lo que falló fue la red, la sesión sigue siendo buena: se conserva y se intenta
          // de nuevo cuando vuelva la conexión. Antes un corte justo en este momento borraba
          // los tokens y mandaba al login a una caja que podía seguir trabajando.
          if (err instanceof TypeError) return SIN_RED;
          localStorage.removeItem("pos_token");
          localStorage.removeItem("pos_refresh_token");
          window.location.reload();
        }).finally(() => {
          isRefreshing = false;
        });
      }

      const newToken = await refreshPromise;
      if (newToken === SIN_RED) throw errorDeRed();
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        try {
          res = await fetch(`${BASE}${path}`, { ...options, headers });
        } catch {
          throw errorDeRed();
        }
      } else {
        return; // Page reloading
      }
    } else {
      localStorage.removeItem("pos_token");
      window.location.reload();
      return;
    }
  }

  // Un 200 cuyo cuerpo no se puede leer NO es un éxito vacío. Pasa cuando la conexión se corta
  // a mitad de la respuesta o cuando algo intermedio (proxy, portal del router) contesta HTML.
  // Antes se devolvía `{}` como si nada: el refresco del POS guardaba `products = undefined` y
  // el siguiente render caía en la pantalla de "Ocurrió un error inesperado" con
  // "Cannot read properties of undefined (reading 'length')". Todo lo que pasa por aquí es
  // JSON, así que un cuerpo ilegible se trata como un fallo de red.
  let data = {};
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : {};
  } catch {
    if (res.ok) {
      throw buildApiError(
        503,
        "La respuesta del servidor llegó incompleta. Revisa tu conexión o intenta de nuevo.",
        "BAD_RESPONSE"
      );
    }
    data = {};
  }

  if (!res.ok) {
    if (res.status === 403) {
      throw buildApiError(403, data.message || "No tienes permisos para esta acción", "FORBIDDEN", data);
    }
    // Siempre usar el mensaje real del servidor (ej: "Contraseña incorrecta")
    // El flujo de refresh token ya maneja la sesión expirada por separado
    throw buildApiError(res.status, data.message || "Error en la solicitud", data.code, data);
  }
  return data;
}

// Campos de texto que SÍ viajan vacíos. Para el resto, una cadena vacía significa "no lo
// mandes" y el servidor conserva lo que tenía —así una edición parcial no borra medio
// producto—, pero en estos vaciar la caja es justamente cómo se quita el dato, y sin esto no
// habría manera de borrarlo desde el modal. El código de barras va aquí porque uno mal
// cargado (o repetido) tiene que poder quitarse: el servidor guarda el vacío como NULL.
const CAMPOS_VACIABLES = ["brand", "short_description", "description", "benefits", "barcode", "piece_mode", "piece_width_mm"];

function buildProductForm(body, imageFile, removeImage) {
  const fd = new FormData();
  Object.entries(body).forEach(([k, v]) => {
    if (v === "" && CAMPOS_VACIABLES.includes(k)) { fd.append(k, ""); return; }
    if (v == null || v === "") return;
    // Los arrays deben ir como JSON para que el backend pueda parsearlos
    fd.append(k, Array.isArray(v) ? JSON.stringify(v) : v);
  });
  if (imageFile) fd.append("image", imageFile);
  if (removeImage) fd.append("remove_image", "true");
  return fd;
}

// Una categoría se guarda como JSON salvo que traiga foto: solo entonces hace falta
// multipart. Así el resto del sistema —donde nadie sube fotos de categoría— sigue mandando
// exactamente lo que mandaba antes.
function categoryPayload(body, imageFile, clearImage) {
  if (!imageFile && !clearImage) return { body: JSON.stringify(body) };
  const fd = new FormData();
  Object.entries(body).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, v);
  });
  if (imageFile) fd.append("image", imageFile);
  if (clearImage) fd.append("clear_image", "true");
  return { body: fd };
}

// Un banco o método de pago se guarda como JSON salvo que traiga logo: solo entonces hace
// falta multipart, igual que categoryPayload.
function bankMethodPayload(body, imageFile, clearImage) {
  if (!imageFile && !clearImage) return { body: JSON.stringify(body) };
  const fd = new FormData();
  Object.entries(body).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, typeof v === "boolean" ? String(v) : v);
  });
  if (imageFile) fd.append("image", imageFile);
  if (clearImage) fd.append("clear_image", "true");
  return { body: fd };
}

// Datos + archivos de un banner. A diferencia de buildProductForm, aquí SÍ se mandan las
// cadenas vacías: vaciar el enlace o el título de un banner es una edición válida, y
// saltárselas dejaría el valor viejo guardado sin forma de borrarlo desde el panel.
function bannerForm(fields = {}, files = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, typeof v === "boolean" ? String(v) : v);
  });
  if (files.image) fd.append("image", files.image);
  if (files.image_mobile) fd.append("image_mobile", files.image_mobile);
  return fd;
}

export const api = {
  // ¿Volvió internet? Lo pregunta la caja sin conexión cada pocos segundos (ver offline/sync.js).
  ping: () => request("/ping"),
  auth: {
    login: async (body) => {
      const data = await request("/auth/login", { method: "POST", body: JSON.stringify(body), timeout: 15_000 });
      if (data.token) localStorage.setItem("pos_token", data.token);
      if (data.refresh_token) localStorage.setItem("pos_refresh_token", data.refresh_token);
      return data;
    },
    me:             ()          => request("/auth/me"),
    changePassword: (body)      => request("/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
  },
  products: {
    getAll:  (params = {})         => request("/products?" + new URLSearchParams(params)),
    create:  (body, imageFile)     => request("/products",      { method: "POST", body: buildProductForm(body, imageFile) }),
    update:  (id, body, imageFile, removeImage) => request(`/products/${id}`,{ method: "PUT",  body: buildProductForm(body, imageFile, removeImage) }),
    remove:  (id)                  => request(`/products/${id}`,{ method: "DELETE" }),
    // Variantes de un modelo; con warehouse_id, existencias y precio de esa sucursal.
    variants: (id, params = {}) => request(`/products/${id}/variants?` + new URLSearchParams(params)),
    // Foto de todas las variantes que llevan ese valor (la de "Negro" para Negro/S, M, L).
    setVariantImage: (id, attributeValueId, imageFile) => {
      const fd = new FormData();
      fd.append("attribute_value_id", attributeValueId);
      if (imageFile) fd.append("image", imageFile); else fd.append("remove", "true");
      return request(`/products/${id}/variant-image`, { method: "PUT", body: fd });
    },
    // Publica u oculta varios productos del catálogo público en una sola llamada
    setCatalogVisibility: (ids, visible) =>
      request("/products/catalog-visibility", { method: "PATCH", body: JSON.stringify({ ids, visible }) }),
    // Carga masiva desde Excel. El archivo se lee en el navegador; aquí solo viajan las
    // filas ya normalizadas, que el servidor revalida antes de escribir.
    importar: (body) => request("/products/import", { method: "POST", body: JSON.stringify(body) }),
    // Hereda la foto de otra tienda para los productos sin imagen (match por código de
    // barras). Trabaja por lotes con cursor (`after_id`) porque en Vercel una pasada por todo
    // el catálogo se pasaría del timeout; el llamador repite mientras `hay_mas`.
    backfillImages: (after_id = 0) =>
      request("/products/backfill-images", { method: "POST", body: JSON.stringify({ after_id }) }),
  },
  // Etiquetas de beneficio reusables para la ficha pública del producto ("Repara y
  // fortalece"). JSON simple, sin archivos.
  // Atributos de variante (Talla, Color) y sus valores, por empresa.
  productAttributes: {
    getAll:      () => request("/product-attributes"),
    create:      (name, values = []) => request("/product-attributes", { method: "POST", body: JSON.stringify({ name, values }) }),
    rename:      (id, name) => request(`/product-attributes/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
    remove:      (id) => request(`/product-attributes/${id}`, { method: "DELETE" }),
    addValues:   (id, values) => request(`/product-attributes/${id}/values`, { method: "POST", body: JSON.stringify({ values }) }),
    renameValue: (id, valueId, value) => request(`/product-attributes/${id}/values/${valueId}`, { method: "PUT", body: JSON.stringify({ value }) }),
    removeValue: (id, valueId) => request(`/product-attributes/${id}/values/${valueId}`, { method: "DELETE" }),
    reorder:     (id, ids) => request(`/product-attributes/${id}/values/order`, { method: "PUT", body: JSON.stringify({ ids }) }),
  },
  benefitTags: {
    getAll: () => request("/benefit-tags"),
    create: (name) => request("/benefit-tags", { method: "POST", body: JSON.stringify({ name }) }),
    update: (id, name) => request(`/benefit-tags/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
    remove: (id) => request(`/benefit-tags/${id}`, { method: "DELETE" }),
  },
  categories: {
    getAll:  ()          => request("/categories"),
    // imageFile / clearImage son opcionales y solo los usa la vitrina pública: sin ellos la
    // llamada sigue siendo el JSON de siempre, que es como la usan el catálogo y el modal
    // de productos.
    create:  (body, imageFile)             => request("/categories",       { method: "POST",   ...categoryPayload(body, imageFile) }),
    update:  (id, body, imageFile, clearImage) => request(`/categories/${id}`, { method: "PUT",    ...categoryPayload(body, imageFile, clearImage) }),
    remove:  (id)        => request(`/categories/${id}`, { method: "DELETE" }),
  },
  customers: {
    getAll:       (params={}, opts={}) => request("/customers?" + new URLSearchParams(params), opts),
    getOne:       (id, params={}) => request(`/customers/${id}?` + new URLSearchParams(params)),
    getPurchases: (id, params = {}) => request(`/customers/${id}/purchases?` + new URLSearchParams(params)),
    create:       (body)      => request("/customers",       { method: "POST", body: JSON.stringify(body) }),
    update:       (id, body)   => request(`/customers/${id}`, { method: "PUT",  body: JSON.stringify(body) }),
    adjustCredit: (id, amount) => request(`/customers/${id}/credit`, { method: "PATCH", body: JSON.stringify({ amount }) }),
    creditRefund: (id, body)   => request(`/customers/${id}/credit-refund`, { method: "POST", body: JSON.stringify(body) }),
    remove:       (id)         => request(`/customers/${id}`, { method: "DELETE" }),
  },
  sales: {
    getAll:      (params={}) => request("/sales?"       + new URLSearchParams(params)),
    receivables: (params={}) => request("/sales/receivables?" + new URLSearchParams(params)),
    setDueDate:  (id, due_date) => request(`/sales/${id}/due-date`, { method: "PATCH", body: JSON.stringify({ due_date }) }),
    getPending:  (params={}) => {
      const sp = new URLSearchParams(params);
      ["borrador", "pendiente", "parcial"].forEach(s => sp.append("status", s));
      return request("/sales?" + sp);
    },
    getStats:    (params={}) => request("/sales/stats?" + new URLSearchParams(params)),
    getOne:      (id)        => request(`/sales/${id}`),
    // Con tope de espera: si la base se congela, la caja pasa a vender sin conexión con la
    // misma clave de idempotencia en vez de quedarse colgada (ver servidorCaido).
    create:      (body)      => request("/sales",        { method: "POST",   body: JSON.stringify(body), timeout: 20_000 }),
    // Venta hecha sin conexión, enviada desde la cola del equipo (ver offline/sync.js).
    syncOffline: (body)      => request("/sales/offline", { method: "POST",  body: JSON.stringify(body), timeout: 30_000 }),
    update:      (id, body)  => request(`/sales/${id}`,  { method: "PATCH",  body: JSON.stringify(body) }),
    cancel:      (id)        => request(`/sales/${id}`,  { method: "DELETE" }),
    // Entrega a crédito: asigna correlativo y deja la venta en 'pendiente' (por cobrar)
    confirmCredit: (id)      => request(`/sales/${id}/credit`, { method: "POST" }),
    // Exonerar: perdona el saldo pendiente y cierra la factura sin cobrarla. `reason` es
    // obligatorio. Deshacerla la devuelve a por cobrar con el saldo que tenía.
    forgive:     (id, reason, rate) => request(`/sales/${id}/forgive`, { method: "POST", body: JSON.stringify({ reason, rate }) }),
    unforgive:   (id)         => request(`/sales/${id}/forgive`, { method: "DELETE" }),
    // Cuentas en espera y pedidos del catálogo público: visibles desde cualquier caja.
    // Los 'pedido' todavía no descontaron inventario; se listan juntos porque se
    // atienden en el mismo sitio y se distinguen por su status.
    getHeld:     (params={}) => {
      const sp = new URLSearchParams(params);
      ["espera", "pedido"].forEach(s => sp.append("status", s));
      sp.set("limit", "100");
      // Solo se usan las filas: sin conteo ni totales del pie (ver getAllSales.js).
      sp.set("summary", "0");
      return request("/sales?" + sp);
    },
    // Acepta un pedido web: descuenta stock del almacén indicado y lo pasa a 'espera'
    acceptOrder: (id, body)  => request(`/sales/${id}/accept-order`, { method: "POST", body: JSON.stringify(body) }),
    // Toma / suelta una cuenta en espera para que las demás cajas la vean bloqueada.
    claim:       (id)        => request(`/sales/${id}/claim`, { method: "POST" }),
    release:     (id)        => request(`/sales/${id}/claim`, { method: "DELETE" }),
    // Devoluciones
    createReturn:   (id, body) => request(`/sales/${id}/return`,   { method: "POST", body: JSON.stringify(body) }),
    createExchange: (id, body) => request(`/sales/${id}/exchange`, { method: "POST", body: JSON.stringify(body) }),
    getReturns:     (id)       => request(`/sales/${id}/returns`),
  },
  employees: {
    getAll:      ()          => request("/employees"),
    getPermissionCatalog: () => request("/employees/permissions"),
    getRoles:    ()          => request("/employees/roles"),
    create:      (body)      => request("/employees",            { method: "POST",   body: JSON.stringify(body) }),
    update:      (id, body)  => request(`/employees/${id}`,      { method: "PUT",    body: JSON.stringify(body) }),
    remove:      (id)        => request(`/employees/${id}`,      { method: "DELETE" }),
    updateRole:  (id, body)  => request(`/employees/roles/${id}`,{ method: "PUT",    body: JSON.stringify(body) }),
  },
  currencies: {
    getAll:       ()         => request("/currencies"),
    create:       (body)     => request("/currencies",               { method: "POST", body: JSON.stringify(body) }),
    updateRate:   (id, body) => request(`/currencies/${id}/rate`,   { method: "PUT",  body: JSON.stringify(body) }),
    toggle:       (id)       => request(`/currencies/${id}/toggle`, { method: "PUT" }),
    remove:       (id)       => request(`/currencies/${id}`,        { method: "DELETE" }),
    refreshRates: ()         => request("/currencies/refresh",       { method: "POST" }),
    // Tasa publicada por el BCV con su fecha valor, sin aplicarla.
    bcv:          (fresh)    => request(`/currencies/bcv${fresh ? "?fresh=1" : ""}`),
  },
  journals: {
    getAll:       ()              => request("/payment-journals"),
    getSummary:   (params={})     => request("/payment-journals/summary?" + new URLSearchParams(params)),
    getMovements:     (id, params={})     => request(`/payment-journals/${id}/movements?` + new URLSearchParams(params)),
    getBankMovements: (bankId, params={}) => request(`/payment-journals/bank/${bankId}/movements?` + new URLSearchParams(params)),
    create:       (body)          => request("/payment-journals",       { method: "POST",   body: JSON.stringify(body) }),
    update:       (id, body)      => request(`/payment-journals/${id}`, { method: "PUT",    body: JSON.stringify(body) }),
    remove:       (id)            => request(`/payment-journals/${id}`, { method: "DELETE" }),
  },
  purchases: {
    getAll:         (params = {}) => request("/purchases?" + new URLSearchParams(params)),
    getOne:         (id)          => request(`/purchases/${id}`),
    create:         (body)        => request("/purchases",                      { method: "POST",   body: JSON.stringify(body) }),
    update:         (id, body)    => request(`/purchases/${id}`,                { method: "PATCH",  body: JSON.stringify(body) }),
    confirm:        (id)          => request(`/purchases/${id}/confirm`,        { method: "PATCH" }),
    receive:        (id)          => request(`/purchases/${id}/receive`,        { method: "PATCH" }),
    updateLots:     (id, items)   => request(`/purchases/${id}/lots`,           { method: "PATCH",  body: JSON.stringify({ items }) }),
    cancel:         (id)          => request(`/purchases/${id}`,                { method: "DELETE" }),
    getPayments:    (id)          => request(`/purchases/${id}/payments`),
    createPayment:  (id, body)    => request(`/purchases/${id}/payments`,       { method: "POST",   body: JSON.stringify(body) }),
    payables:       (params = {}) => request("/purchases/payables?"              + new URLSearchParams(params)),
    createBulkPayment: (body)     => request("/purchases/payments/bulk",         { method: "POST",   body: JSON.stringify(body) }),
    setDueDate:     (id, due_date) => request(`/purchases/${id}/due-date`,      { method: "PATCH",  body: JSON.stringify({ due_date }) }),
    removePayment:  (paymentId)   => request(`/purchase-payments/${paymentId}`, { method: "DELETE" }),
  },
  settings: {
    getAll:     ()      => request("/settings"),
    update:     (body)  => request("/settings", { method: "PUT", body: JSON.stringify(body) }),
    uploadLogo: (file)  => {
      const fd = new FormData(); fd.append("logo", file);
      return request("/settings/logo", { method: "POST", body: fd });
    },
  },
  // Enlace del catálogo público (requiere permiso "config")
  catalogLink: {
    get:    () => request("/catalog-link"),
    create: () => request("/catalog-link", { method: "POST" }),
    revoke: () => request("/catalog-link", { method: "DELETE" }),
  },
  // Carrusel de la vitrina pública. Los banners llevan archivos, así que van por multipart:
  // `fields` son los datos y `files` las imágenes que se hayan cambiado en esta edición.
  catalogBanners: {
    getAll: () => request("/catalog-banners"),
    create: (fields, files) => request("/catalog-banners", { method: "POST", body: bannerForm(fields, files) }),
    update: (id, fields, files) => request(`/catalog-banners/${id}`, { method: "PUT", body: bannerForm(fields, files) }),
    remove: (id) => request(`/catalog-banners/${id}`, { method: "DELETE" }),
    reorder: (ids) => request("/catalog-banners/reorder", { method: "PUT", body: JSON.stringify({ ids }) }),
  },
  backup: {
    list:     ()           => request("/backup"),
    trigger:  ()           => request("/backup/trigger", { method: "POST" }),
    download: (filename)   => `${(import.meta.env.VITE_API_URL || "") + "/api"}/backup/download/${encodeURIComponent(filename)}`,
    remove:   (filename)   => request(`/backup/${encodeURIComponent(filename)}`, { method: "DELETE" }),
  },
  warehouses: {
    addStock: (id, body) => request(`/warehouses/${id}/stock`, { method: "POST", body: JSON.stringify(body) }),
    setStock: (id, productId, body) => request(`/warehouses/${id}/stock/${productId}`, { method: "PUT", body: JSON.stringify(body) }),
    removeStock: (id, productId) => request(`/warehouses/${id}/stock/${productId}`, { method: "DELETE" }),
    getAll:          (params={}) => request("/warehouses?" + new URLSearchParams(params)),
    create:          (body)      => request("/warehouses",             { method: "POST",   body: JSON.stringify(body) }),
    update:          (id, body)  => request(`/warehouses/${id}`,       { method: "PUT",    body: JSON.stringify(body) }),
    remove:          (id)        => request(`/warehouses/${id}`,       { method: "DELETE" }),
    getStock:        (id, params={}) => request(`/warehouses/${id}/stock?` + new URLSearchParams(params)),
    getByEmployee:   (empId)     => request(`/warehouses/employee/${empId}`),
    assignEmployees: (id, body)  => request(`/warehouses/${id}/employees`, { method: "PUT", body: JSON.stringify(body) }),
    transfer:        (body)      => request("/warehouses/transfer",    { method: "POST",   body: JSON.stringify(body) }),
    getTransfers:    (params={}) => request("/warehouses/transfers?"   + new URLSearchParams(params)),
    getTransfer:     (id)        => request(`/warehouses/transfers/${id}`),
    transferSummary: (params={}) => request("/warehouses/transfers/summary?" + new URLSearchParams(params)),
    receiveTransfer: (id, body)  => request(`/warehouses/transfers/${id}/receive`, { method: "POST", body: JSON.stringify(body) }),
    resolveTransfer: (id, body)  => request(`/warehouses/transfers/${id}/resolve`, { method: "POST", body: JSON.stringify(body) }),
    cancelTransfer:  (id, body)  => request(`/warehouses/transfers/${id}/cancel`,  { method: "POST", body: JSON.stringify(body) }),
    getProducts: (id, params = {}, opts = {}) => request(`/warehouses/${id}/products?` + new URLSearchParams(params), opts),
    // Kardex: historial de un producto y el buscador de productos que lo alimenta.
    movements:        (params = {}) => request("/warehouses/movements?" + new URLSearchParams(params)),
    movementProducts: (params = {}) => request("/warehouses/movements/products?" + new URLSearchParams(params)),
    sessions: {
      getActive:  (id)                  => request(`/warehouses/${id}/sessions/active`),
      open:       (id)                  => request(`/warehouses/${id}/sessions`,                       { method: "POST" }),
      addLine:    (id, sessionId, body) => request(`/warehouses/${id}/sessions/${sessionId}/lines`,    { method: "POST", body: JSON.stringify(body) }),
      close:      (id, sessionId, body) => request(`/warehouses/${id}/sessions/${sessionId}/close`,    { method: "PATCH", body: JSON.stringify(body) }),
      getAll:     (id, params = {})     => request(`/warehouses/${id}/sessions?` + new URLSearchParams(params)),
    },
  },

  // ── Bancos ──────────────────────────────────────────────────
  banks: {
    getAll:  ()          => request("/banks"),
    // imageFile / clearImage son opcionales: sin ellos se manda el JSON de siempre.
    create:  (body, imageFile)             => request("/banks",       { method: "POST", ...bankMethodPayload(body, imageFile) }),
    update:  (id, body, imageFile, clearImage) => request(`/banks/${id}`, { method: "PUT",  ...bankMethodPayload(body, imageFile, clearImage) }),
    toggle:  (id)        => request(`/banks/${id}/toggle`, { method: "PUT" }),
    remove:  (id)        => request(`/banks/${id}`, { method: "DELETE" }),
  },

  // ── Pagos clientes ──────────────────────────────────────────
  payments: {
    getAll:     (params={}) => request("/payments?"        + new URLSearchParams(params)),
    getStats:   (params={}) => request("/payments/stats?"  + new URLSearchParams(params)),
    getPending: (params={}) => request("/payments/pending?" + new URLSearchParams(params)),
    create:     (body)      => request("/payments", { method: "POST", body: JSON.stringify(body) }),
    // Un solo monto contra varias facturas del mismo cliente: el servidor lo reparte de la
    // más vieja a la más nueva y registra un cobro por factura.
    createBulk: (body)      => request("/payments/bulk", { method: "POST", body: JSON.stringify(body) }),
    remove:     (id)        => request(`/payments/${id}`, { method: "DELETE" }),
    // Deshace un cobro conjunto entero: sus partes no se pueden borrar por separado.
    removeBatch:(batchId)   => request(`/payments/batch/${encodeURIComponent(batchId)}`, { method: "DELETE" }),
  },

  // ── Series de facturación ───────────────────────────────────
  series: {
    getAll:      ()          => request("/series"),
    getMy:       (params={}) => request("/series/my?" + new URLSearchParams(params)),
    create:      (body)      => request("/series",                 { method: "POST",   body: JSON.stringify(body) }),
    update:      (id, body)  => request(`/series/${id}`,           { method: "PUT",    body: JSON.stringify(body) }),
    remove:      (id)        => request(`/series/${id}`,           { method: "DELETE" }),
    addRange:    (id, body)  => request(`/series/${id}/ranges`,    { method: "POST",   body: JSON.stringify(body) }),
    removeRange: (rangeId)   => request(`/series/ranges/${rangeId}`,{ method: "DELETE" }),
    assignUsers: (id, body)  => request(`/series/${id}/users`,     { method: "PUT",    body: JSON.stringify(body) }),
  },

  // ── Métodos de pago ─────────────────────────────────────────
  paymentMethods: {
    getAll:  ()          => request("/banks/methods"),
    create:  (body, imageFile)             => request("/banks/methods",       { method: "POST", ...bankMethodPayload(body, imageFile) }),
    update:  (id, body, imageFile, clearImage) => request(`/banks/methods/${id}`, { method: "PUT",  ...bankMethodPayload(body, imageFile, clearImage) }),
    toggle:  (id)        => request(`/banks/methods/${id}/toggle`, { method: "PUT" }),
    remove:  (id)        => request(`/banks/methods/${id}`, { method: "DELETE" }),
  },

  // ── Dashboard ────────────────────────────────────────────────
  dashboard: {
    get: (params={}) => request("/dashboard?" + new URLSearchParams(params)),
  },

  // ── Reportes ─────────────────────────────────────────────────
  reports: {
    sales:              (params = {}) => request("/reports/sales?"              + new URLSearchParams(params)),
    products:           (params = {}) => request("/reports/products?"           + new URLSearchParams(params)),
    receivables:        ()            => request("/reports/receivables"),
    purchases:          (params = {}) => request("/reports/purchases?"          + new URLSearchParams(params)),
    inventory:          (params = {}) => request("/reports/inventory?"          + new URLSearchParams(params)),
    margins:            (params = {}) => request("/reports/margins?"            + new URLSearchParams(params)),
    customersAnalysis:  (params = {}) => request("/reports/customers-analysis?" + new URLSearchParams(params)),
    audit:              (params = {}) => request("/reports/audit?"              + new URLSearchParams(params)),
    expiry:             (params = {}) => request("/reports/expiry?"             + new URLSearchParams(params)),
    paymentJournals:    (params = {}) => request("/reports/payment-journals?"   + new URLSearchParams(params)),
    finance:            (params = {}) => request("/reports/finance?"            + new URLSearchParams(params)),
  },

  cashSessions: {
    open:       (body)   => request("/cash-sessions/open",           { method: "POST", body: JSON.stringify(body) }),
    current:    (params) => request("/cash-sessions/current?"        + new URLSearchParams(params)),
    summary:    (id)     => request(`/cash-sessions/${id}/summary`),
    close:      (id, body) => request(`/cash-sessions/${id}/close`,  { method: "POST", body: JSON.stringify(body) }),
    history:    (params) => request("/cash-sessions/history?"        + new URLSearchParams(params)),
  },

  // ── Ingresos ─────────────────────────────────────────────────
  incomes: {
    getAll:         (params={}) => request("/incomes?"              + new URLSearchParams(params)),
    getCategories:  ()          => request("/incomes/categories"),
    upsertCategory: (body)      => request("/incomes/categories",    { method: "POST", body: JSON.stringify(body) }),
    create:         (body)      => request("/incomes",               { method: "POST", body: JSON.stringify(body) }),
    void:           (id)        => request(`/incomes/${id}`,         { method: "DELETE" }),
    delete:         (id)        => request(`/incomes/${id}/permanent`, { method: "DELETE" }),
  },

  // ── Egresos ──────────────────────────────────────────────────
  expenses: {
    getAll:         (params={}) => request("/expenses?"             + new URLSearchParams(params)),
    getCategories:  ()          => request("/expenses/categories"),
    upsertCategory: (body)      => request("/expenses/categories",   { method: "POST", body: JSON.stringify(body) }),
    create:         (body)      => request("/expenses",              { method: "POST", body: JSON.stringify(body) }),
    void:           (id)        => request(`/expenses/${id}`,           { method: "DELETE" }),
    delete:         (id)        => request(`/expenses/${id}/permanent`, { method: "DELETE" }),
  },

  // ── Conciliación bancaria ────────────────────────────────────
  reconciliation: {
    accounts:   ()                 => request("/bank-reconciliations/accounts"),
    getAll:     (params={})        => request("/bank-reconciliations?" + new URLSearchParams(params)),
    getOne:     (id)               => request(`/bank-reconciliations/${id}`),
    create:     (body)             => request("/bank-reconciliations", { method: "POST", body: JSON.stringify(body) }),
    remove:     (id)               => request(`/bank-reconciliations/${id}`, { method: "DELETE" }),
    auto:       (id)               => request(`/bank-reconciliations/${id}/auto`, { method: "POST" }),
    charges:    (id, body={})      => request(`/bank-reconciliations/${id}/charges`, { method: "POST", body: JSON.stringify(body) }),
    candidates: (id, lineId, params={}) => request(`/bank-reconciliations/${id}/lines/${lineId}/candidates?` + new URLSearchParams(params)),
    match:      (id, lineId, body) => request(`/bank-reconciliations/${id}/lines/${lineId}/match`,    { method: "POST", body: JSON.stringify(body) }),
    register:   (id, lineId, body) => request(`/bank-reconciliations/${id}/lines/${lineId}/register`, { method: "POST", body: JSON.stringify(body) }),
    ignore:     (id, lineId, body={}) => request(`/bank-reconciliations/${id}/lines/${lineId}/ignore`, { method: "POST", body: JSON.stringify(body) }),
    unmatch:    (id, lineId)       => request(`/bank-reconciliations/${id}/lines/${lineId}/unmatch`,  { method: "POST" }),
  },

  // ── Fábrica: láminas, retazos y órdenes de fabricación ───────
  factory: {
    materials:      (params={})        => request("/factory/materials?" + new URLSearchParams(params)),
    saveMaterial:   (body)             => request("/factory/materials", { method: "POST", body: JSON.stringify(body) }),
    pieces:         (params={})        => request("/factory/pieces?" + new URLSearchParams(params)),
    registerPieces: (body)             => request("/factory/pieces", { method: "POST", body: JSON.stringify(body) }),
    piece:          (id)               => request(`/factory/pieces/${id}`),
    dischargePiece: (id, body)         => request(`/factory/pieces/${id}/discharge`, { method: "POST", body: JSON.stringify(body) }),
    stages:         (params={})        => request("/factory/stages?" + new URLSearchParams(params)),
    saveStage:      (body)             => body.id
      ? request(`/factory/stages/${body.id}`, { method: "PUT", body: JSON.stringify(body) })
      : request("/factory/stages", { method: "POST", body: JSON.stringify(body) }),
    reorderStages:  (ids)              => request("/factory/stages/order", { method: "PUT", body: JSON.stringify({ ids }) }),
    deleteStage:    (id)               => request(`/factory/stages/${id}`, { method: "DELETE" }),
    presetStages:   ()                 => request("/factory/stages/presets", { method: "POST" }),
    moveStage:      (id, body)         => request(`/factory/orders/${id}/stage`, { method: "POST", body: JSON.stringify(body) }),
    evaluateRecipe: (body)             => request("/factory/recipes/evaluate", { method: "POST", body: JSON.stringify(body) }),
    recipes:        ()                 => request("/factory/recipes"),
    recipe:         (productId)        => request(`/factory/recipes/${productId}`),
    recipePreview:  (productId, params={}) => request(`/factory/recipes/${productId}/preview?` + new URLSearchParams(params)),
    saveRecipe:     (productId, body)  => request(`/factory/recipes/${productId}`, { method: "PUT", body: JSON.stringify(body) }),
    deleteRecipe:   (productId)        => request(`/factory/recipes/${productId}`, { method: "DELETE" }),
    orders:         (params={})        => request("/factory/orders?" + new URLSearchParams(params)),
    order:          (id)               => request(`/factory/orders/${id}`),
    createOrder:    (body)             => request("/factory/orders", { method: "POST", body: JSON.stringify(body) }),
    updateOrder:    (id, body)         => request(`/factory/orders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deliverPiece:   (id, body)         => request(`/factory/orders/${id}/pieces`, { method: "POST", body: JSON.stringify(body) }),
    cancelDelivery: (id, useId)        => request(`/factory/orders/${id}/pieces/${useId}`, { method: "DELETE" }),
    returnPiece:    (id, useId, body)  => request(`/factory/orders/${id}/pieces/${useId}/return`, { method: "POST", body: JSON.stringify(body) }),
    undoReturn:     (id, useId)        => request(`/factory/orders/${id}/pieces/${useId}/undo`, { method: "POST" }),
    addItem:        (id, body)         => request(`/factory/orders/${id}/items`, { method: "POST", body: JSON.stringify(body) }),
    removeItem:     (id, itemId)       => request(`/factory/orders/${id}/items/${itemId}`, { method: "DELETE" }),
    finish:         (id, body={})      => request(`/factory/orders/${id}/finish`, { method: "POST", body: JSON.stringify(body) }),
    reopen:         (id)               => request(`/factory/orders/${id}/reopen`, { method: "POST" }),
    cancel:         (id, body)         => request(`/factory/orders/${id}/cancel`, { method: "POST", body: JSON.stringify(body) }),
    invoice:        (id, body)         => request(`/factory/orders/${id}/invoice`, { method: "POST", body: JSON.stringify(body) }),
  },
  companies: {
    getAll: ()          => request("/companies"),
    create: (body)      => request("/companies",       { method: "POST",   body: JSON.stringify(body) }),
    update: (id, body)  => request(`/companies/${id}`, { method: "PUT",    body: JSON.stringify(body) }),
    remove: (id)        => request(`/companies/${id}`, { method: "DELETE" }),
  },

  // ── Cotizaciones ─────────────────────────────────────────────
  quotations: {
    getAll:   (params={}) => request("/quotations?" + new URLSearchParams(params)),
    getOne:   (id)        => request(`/quotations/${id}`),
    create:   (body)      => request("/quotations",             { method: "POST",  body: JSON.stringify(body) }),
    cancel:   (id)        => request(`/quotations/${id}/cancel`,{ method: "PATCH" }),
    convert:  (id, body)  => request(`/quotations/${id}/convert`,{ method: "POST", body: JSON.stringify(body) }),
    remove:   (id)        => request(`/quotations/${id}`,       { method: "DELETE" }),
  },

  // ── Promociones ───────────────────────────────────────────────
  promotions: {
    getAll:    ()         => request("/promotions"),
    // Sin warehouse_id solo vienen las que corren en todas las sucursales.
    getActive: (params={}) => request("/promotions/active?" + new URLSearchParams(params)),
    create:    (body)     => request("/promotions",       { method: "POST",   body: JSON.stringify(body) }),
    update:    (id, body) => request(`/promotions/${id}`, { method: "PUT",    body: JSON.stringify(body) }),
    remove:    (id)       => request(`/promotions/${id}`, { method: "DELETE" }),
  },

  // ── Notas de Crédito ──────────────────────────────────────────
  creditNotes: {
    getAll: (params = {}) => request("/credit-notes?" + new URLSearchParams(params)),
    annul:  (id)          => request(`/credit-notes/${id}/annul`, { method: "PUT" }),
  },
};

// ── Catálogo público ──────────────────────────────────────────
// Usa fetch plano a propósito: request() adjunta el token de sesión y, ante un 401,
// intenta refrescarlo y puede recargar la página. Nada de eso tiene sentido para un
// cliente que solo abrió un enlace, y no queremos tocarle el localStorage.
async function publicRequest(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch (err) {
    if (err.message?.toLowerCase().includes("failed to fetch") || err.name === "TypeError") {
      throw buildApiError(
        503,
        "No se pudo conectar con el servidor. Revisa tu conexión o intenta de nuevo en unos segundos.",
        "NETWORK_ERROR"
      );
    }
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw buildApiError(res.status, json.message, json.code, json);
  return json;
}

export const publicApi = {
  getStore: (token, params = {}) =>
    publicRequest(`/public/catalog/${encodeURIComponent(token)}?` + new URLSearchParams(params)),
  getProducts: (token, params = {}) =>
    publicRequest(`/public/catalog/${encodeURIComponent(token)}/products?` + new URLSearchParams(params)),
  getProduct: (token, id, params = {}) =>
    publicRequest(`/public/catalog/${encodeURIComponent(token)}/products/${encodeURIComponent(id)}?` + new URLSearchParams(params)),
  identify: (token, document) =>
    publicRequest(`/public/catalog/${encodeURIComponent(token)}/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document }),
    }),
  myOrders: (token, document) =>
    publicRequest(`/public/catalog/${encodeURIComponent(token)}/my-orders?` + new URLSearchParams({ document })),
  createOrder: (token, body) =>
    publicRequest(`/public/catalog/${encodeURIComponent(token)}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};