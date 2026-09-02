// Espejo de backend/src/config/permissions.js — solo la parte que el navegador necesita
// para decidir qué mostrar. El catálogo de módulos NO se duplica: se pide a la API
// (GET /employees/permissions), así que agregar un permiso allá lo hace aparecer acá solo.
//
// Lo que sí vive duplicado es el mapa de compatibilidad, porque `can()` tiene que resolver
// sin ir al servidor. Si cambia en el backend, cambia acá.
//
// Quede claro para quien lea esto: la interfaz solo decide qué se VE. Quien decide qué se
// PUEDE es el backend, y lo hace con el mismo mapa.
export const LEGACY_MAP = {
  sales: [
    "sales.view", "sales.create", "sales.edit", "sales.void", "sales.credit", "sales.return", "sales.cash",
    "customers.view", "customers.create", "customers.edit", "customers.credit",
  ],
  products: [
    "products.view", "products.create", "products.edit",
    "purchases.view", "purchases.create", "purchases.edit", "purchases.receive", "purchases.pay", "purchases.delete",
  ],
  customers: ["customers.view", "customers.create", "customers.edit", "sales.create"],
  inventory: [
    "inventory.view", "inventory.adjust", "inventory.transfer", "inventory.receive",
    "purchases.view", "purchases.create", "purchases.edit", "purchases.receive", "purchases.pay",
    "reports.view",
  ],
  inventory_view: ["inventory.view"],
  purchases: ["purchases.view", "purchases.create", "purchases.edit", "purchases.receive", "purchases.pay"],
  accounting: ["accounting.view", "accounting.income", "accounting.expense", "accounting.void"],
  reports: ["reports.view", "sales.view", "accounting.view"],
  employees: ["employees.view", "employees.create", "employees.edit", "employees.delete"],
  config: [
    "config.view", "config.edit",
    "series.view", "series.manage",
    "journals.view", "journals.manage",
    "currencies.view", "currencies.manage",
    "reports.view", "reports.audit",
    "accounting.view", "accounting.income", "accounting.expense", "accounting.void", "accounting.delete",
    "sales.view", "sales.create", "sales.edit", "sales.void", "sales.credit", "sales.cash",
    "products.view", "products.create", "products.edit",
    "customers.view", "customers.create", "customers.edit", "customers.credit",
    "inventory.view", "inventory.adjust", "inventory.transfer", "inventory.receive",
  ],
};

// Misma lógica que el backend: entiende "modulo.accion" y los permisos viejos por módulo.
export function hasPermission(permissions, perm) {
  if (!permissions) return false;
  if (permissions.all) return true;
  if (permissions[perm]) return true;
  if (perm === "admin") return false;

  if (perm.includes(".")) {
    const modulo = perm.split(".")[0];
    if (permissions[modulo] && (LEGACY_MAP[modulo] || []).includes(perm)) return true;
    if (permissions.config && (LEGACY_MAP.config || []).includes(perm)) return true;
    return false;
  }
  return (LEGACY_MAP[perm] || []).some(k => permissions[k]);
}