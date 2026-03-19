const BASE = "/api";

function getToken() {
  return localStorage.getItem("pos_token");
}

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const token = getToken();
  const method = options.method || "GET";
  const headers = {
    ...(isFormData || ["GET", "DELETE"].includes(method) ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (res.status === 401) {
    localStorage.removeItem("pos_token");
    window.location.reload();
    return;
  }
  if (!res.ok) throw new Error(data.message || "Error en la solicitud");
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
    login:          (body)      => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
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
    getAll:   (params={}) => request("/sales?"       + new URLSearchParams(params)),
    getStats: (params={}) => request("/sales/stats?" + new URLSearchParams(params)),
    create:   (body)      => request("/sales",        { method: "POST",   body: JSON.stringify(body) }),
    cancel:   (id)        => request(`/sales/${id}`,  { method: "DELETE" }),
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
    remove:  (id)    => request(`/purchases/${id}`, { method: "DELETE" }),
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

  // ── Métodos de pago ─────────────────────────────────────────
  paymentMethods: {
    getAll:  ()          => request("/banks/methods"),
    create:  (body)      => request("/banks/methods",       { method: "POST",   body: JSON.stringify(body) }),
    update:  (id, body)  => request(`/banks/methods/${id}`, { method: "PUT",    body: JSON.stringify(body) }),
    toggle:  (id)        => request(`/banks/methods/${id}/toggle`, { method: "PUT" }),
    remove:  (id)        => request(`/banks/methods/${id}`, { method: "DELETE" }),
  },
};