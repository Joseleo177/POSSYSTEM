const BASE = "/api";

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
  
  let res = await fetch(`${BASE}${path}`, { ...options, headers });
  
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
      throw buildApiError(403, "No tienes permisos para esta acción", "FORBIDDEN");
    }
    // Siempre usar el mensaje real del servidor (ej: "Contraseña incorrecta")
    // El flujo de refresh token ya maneja la sesión expirada por separado
    throw buildApiError(res.status, data.message || "Error en la solicitud", data.code, data);
  }
  return data;
}

function buildProductForm(body, imageFile) {
  const fd = new FormData();
  Object.entries(body).forEach(([k, v]) => { if (v != null && v !== "") fd.append(k, v); });
  if (imageFile) fd.append("image", imageFile);
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
    update:  (id, body, imageFile) => request(`/products/${id}`,{ method: "PUT",  body: buildProductForm(body, imageFile) }),
    remove:  (id)                  => request(`/products/${id}`,{ method: "DELETE" }),
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
    getPurchases: (id)        => request(`/customers/${id}/purchases`),
    create:       (body)      => request("/customers",       { method: "POST", body: JSON.stringify(body) }),
    update:       (id, body)  => request(`/customers/${id}`, { method: "PUT",  body: JSON.stringify(body) }),
    remove:       (id)        => request(`/customers/${id}`, { method: "DELETE" }),
  },
  sales: {
    getAll:      (params={}) => request("/sales?"       + new URLSearchParams(params)),
    getStats:    (params={}) => request("/sales/stats?" + new URLSearchParams(params)),
    getOne:      (id)        => request(`/sales/${id}`),
    create:      (body)      => request("/sales",        { method: "POST",   body: JSON.stringify(body) }),
    cancel:      (id)        => request(`/sales/${id}`,  { method: "DELETE" }),
    // Devoluciones
    createReturn:  (id, body) => request(`/sales/${id}/return`,  { method: "POST", body: JSON.stringify(body) }),
    getReturns:    (id)       => request(`/sales/${id}/returns`),
  },
  employees: {
    getAll:   ()          => request("/employees"),
    getRoles: ()          => request("/employees/roles"),
    create:   (body)      => request("/employees",       { method: "POST", body: JSON.stringify(body) }),
    update:   (id, body)  => request(`/employees/${id}`, { method: "PUT",  body: JSON.stringify(body) }),
    remove:   (id)        => request(`/employees/${id}`, { method: "DELETE" }),
  },
  currencies: {
    getAll:       ()         => request("/currencies"),
    create:       (body)     => request("/currencies",               { method: "POST", body: JSON.stringify(body) }),
    updateRate:   (id, body) => request(`/currencies/${id}/rate`,   { method: "PUT",  body: JSON.stringify(body) }),
    toggle:       (id)       => request(`/currencies/${id}/toggle`, { method: "PUT" }),
    refreshRates: ()         => request("/currencies/refresh",       { method: "POST" }),
  },
  journals: {
    getAll:     ()          => request("/payment-journals"),
    getSummary: (params={}) => request("/payment-journals/summary?" + new URLSearchParams(params)),
    create:     (body)      => request("/payment-journals",       { method: "POST",   body: JSON.stringify(body) }),
    update:     (id, body)  => request(`/payment-journals/${id}`, { method: "PUT",    body: JSON.stringify(body) }),
    remove:     (id)        => request(`/payment-journals/${id}`, { method: "DELETE" }),
  },
  purchases: {
    getAll:  ()      => request("/purchases"),
    getOne:  (id)    => request(`/purchases/${id}`),
    create:  (body)  => request("/purchases",       { method: "POST",   body: JSON.stringify(body) }),
    cancel:  (id)    => request(`/purchases/${id}`, { method: "DELETE" }),
  },
  settings: {
    getAll:     ()      => request("/settings"),
    update:     (body)  => request("/settings", { method: "PUT", body: JSON.stringify(body) }),
    uploadLogo: (file)  => {
      const fd = new FormData(); fd.append("logo", file);
      return request("/settings/logo", { method: "POST", body: fd });
    },
  },
  warehouses: {
    addStock: (id, body) => request(`/warehouses/${id}/stock`, { method: "POST", body: JSON.stringify(body) }),
    setStock: (id, productId, body) => request(`/warehouses/${id}/stock/${productId}`, { method: "PUT", body: JSON.stringify(body) }),
    removeStock: (id, productId) => request(`/warehouses/${id}/stock/${productId}`, { method: "DELETE" }),
    getAll:          ()          => request("/warehouses"),
    create:          (body)      => request("/warehouses",             { method: "POST",   body: JSON.stringify(body) }),
    update:          (id, body)  => request(`/warehouses/${id}`,       { method: "PUT",    body: JSON.stringify(body) }),
    remove:          (id)        => request(`/warehouses/${id}`,       { method: "DELETE" }),
    getStock:        (id)        => request(`/warehouses/${id}/stock`),
    getByEmployee:   (empId)     => request(`/warehouses/employee/${empId}`),
    assignEmployees: (id, body)  => request(`/warehouses/${id}/employees`, { method: "PUT", body: JSON.stringify(body) }),
    transfer:        (body)      => request("/warehouses/transfer",    { method: "POST",   body: JSON.stringify(body) }),
    getTransfers:    (params={}) => request("/warehouses/transfers?"   + new URLSearchParams(params)),
    getProducts: (id, params = {}) => request(`/warehouses/${id}/products?` + new URLSearchParams(params)),
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
    remove:     (id)        => request(`/payments/${id}`, { method: "DELETE" }),
  },

  // ── Series de facturación ───────────────────────────────────
  series: {
    getAll:      ()          => request("/series"),
    getMy:       ()          => request("/series/my"),
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
  },

  cashSessions: {
    open:       (body)   => request("/cash-sessions/open",           { method: "POST", body: JSON.stringify(body) }),
    current:    (params) => request("/cash-sessions/current?"        + new URLSearchParams(params)),
    summary:    (id)     => request(`/cash-sessions/${id}/summary`),
    close:      (id, body) => request(`/cash-sessions/${id}/close`,  { method: "POST", body: JSON.stringify(body) }),
    history:    (params) => request("/cash-sessions/history?"        + new URLSearchParams(params)),
  },
};