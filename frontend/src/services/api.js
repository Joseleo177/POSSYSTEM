const BASE = (import.meta.env.VITE_API_URL || "") + "/api";

function getToken() {
  return localStorage.getItem("pos_token");
}

let isRefreshing = false;
let refreshPromise = null;

function buildApiError(status, message, code, data) {
  const err = new Error(message || "Error en la solicitud");
  err.status = status;
  err.code = code;
  err.data = data;
  return err;
}

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  let token = getToken();
  const method = options.method || "GET";
  const headers = {
    ...(isFormData || ["GET", "DELETE"].includes(method) ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
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
        }).catch(() => {
          localStorage.removeItem("pos_token");
          localStorage.removeItem("pos_refresh_token");
          window.location.reload();
        }).finally(() => {
          isRefreshing = false;
        });
      }
      
      const newToken = await refreshPromise;
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        res = await fetch(`${BASE}${path}`, { ...options, headers });
      } else {
        return; // Page reloading
      }
    } else {
      localStorage.removeItem("pos_token");
      window.location.reload();
      return;
    }
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
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

function buildProductForm(body, imageFile, removeImage) {
  const fd = new FormData();
  Object.entries(body).forEach(([k, v]) => {
    if (v == null || v === "") return;
    // Los arrays deben ir como JSON para que el backend pueda parsearlos
    fd.append(k, Array.isArray(v) ? JSON.stringify(v) : v);
  });
  if (imageFile) fd.append("image", imageFile);
  if (removeImage) fd.append("remove_image", "true");
  return fd;
}

export const api = {
  auth: {
    login: async (body) => {
      const data = await request("/auth/login", { method: "POST", body: JSON.stringify(body) });
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
    // Publica u oculta varios productos del catálogo público en una sola llamada
    setCatalogVisibility: (ids, visible) =>
      request("/products/catalog-visibility", { method: "PATCH", body: JSON.stringify({ ids, visible }) }),
    // Carga masiva desde Excel. El archivo se lee en el navegador; aquí solo viajan las
    // filas ya normalizadas, que el servidor revalida antes de escribir.
    importar: (body) => request("/products/import", { method: "POST", body: JSON.stringify(body) }),
  },
  categories: {
    getAll:  ()          => request("/categories"),
    create:  (body)      => request("/categories",       { method: "POST",   body: JSON.stringify(body) }),
    update:  (id, body)  => request(`/categories/${id}`, { method: "PUT",    body: JSON.stringify(body) }),
    remove:  (id)        => request(`/categories/${id}`, { method: "DELETE" }),
  },
  customers: {
    getAll:       (params={}) => request("/customers?" + new URLSearchParams(params)),
    getOne:       (id)        => request(`/customers/${id}`),
    getPurchases: (id, params = {}) => request(`/customers/${id}/purchases?` + new URLSearchParams(params)),
    create:       (body)      => request("/customers",       { method: "POST", body: JSON.stringify(body) }),
    update:       (id, body)   => request(`/customers/${id}`, { method: "PUT",  body: JSON.stringify(body) }),
    adjustCredit: (id, amount) => request(`/customers/${id}/credit`, { method: "PATCH", body: JSON.stringify({ amount }) }),
    creditRefund: (id, body)   => request(`/customers/${id}/credit-refund`, { method: "POST", body: JSON.stringify(body) }),
    remove:       (id)         => request(`/customers/${id}`, { method: "DELETE" }),
  },
  sales: {
    getAll:      (params={}) => request("/sales?"       + new URLSearchParams(params)),
    getPending:  (params={}) => {
      const sp = new URLSearchParams(params);
      ["borrador", "pendiente", "parcial"].forEach(s => sp.append("status", s));
      return request("/sales?" + sp);
    },
    getStats:    (params={}) => request("/sales/stats?" + new URLSearchParams(params)),
    getOne:      (id)        => request(`/sales/${id}`),
    create:      (body)      => request("/sales",        { method: "POST",   body: JSON.stringify(body) }),
    update:      (id, body)  => request(`/sales/${id}`,  { method: "PATCH",  body: JSON.stringify(body) }),
    cancel:      (id)        => request(`/sales/${id}`,  { method: "DELETE" }),
    // Entrega a crédito: asigna correlativo y deja la venta en 'pendiente' (por cobrar)
    confirmCredit: (id)      => request(`/sales/${id}/credit`, { method: "POST" }),
    // Exonerar: perdona el saldo pendiente y cierra la factura sin cobrarla. `reason` es
    // obligatorio. Deshacerla la devuelve a por cobrar con el saldo que tenía.
    forgive:     (id, reason) => request(`/sales/${id}/forgive`, { method: "POST", body: JSON.stringify({ reason }) }),
    unforgive:   (id)         => request(`/sales/${id}/forgive`, { method: "DELETE" }),
    // Cuentas en espera y pedidos del catálogo público: visibles desde cualquier caja.
    // Los 'pedido' todavía no descontaron inventario; se listan juntos porque se
    // atienden en el mismo sitio y se distinguen por su status.
    getHeld:     ()          => request("/sales?status=espera&status=pedido&limit=100"),
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
    getProducts: (id, params = {}) => request(`/warehouses/${id}/products?` + new URLSearchParams(params)),
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
    create:  (body)      => request("/banks",       { method: "POST",   body: JSON.stringify(body) }),
    update:  (id, body)  => request(`/banks/${id}`, { method: "PUT",    body: JSON.stringify(body) }),
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
    create:  (body)      => request("/banks/methods",       { method: "POST",   body: JSON.stringify(body) }),
    update:  (id, body)  => request(`/banks/methods/${id}`, { method: "PUT",    body: JSON.stringify(body) }),
    toggle:  (id)        => request(`/banks/methods/${id}/toggle`, { method: "PUT" }),
    remove:  (id)        => request(`/banks/methods/${id}`, { method: "DELETE" }),
  },

  // ── Dashboard ────────────────────────────────────────────────
  dashboard: {
    get: () => request("/dashboard"),
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
  getStore: (token) => publicRequest(`/public/catalog/${encodeURIComponent(token)}`),
  getProducts: (token, params = {}) =>
    publicRequest(`/public/catalog/${encodeURIComponent(token)}/products?` + new URLSearchParams(params)),
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