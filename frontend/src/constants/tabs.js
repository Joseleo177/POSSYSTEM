// src/constants/tabs.js
export const ALL_TABS = [
    // El Dashboard va bajo el permiso de Reportes: muestra facturación, cobranza, saldo en
    // cajas y cuentas por cobrar, que es la misma información gerencial de ese módulo. Un
    // cajero no debe verla, y antes la veía porque el tab no pedía permiso alguno.
    { key: "Dashboard",     label: "Dashboard",     mobileLabel: "Inicio",     perm: "reports.view",    color: "from-teal-500 to-teal-700" },
    { key: "Cobro",         label: "Venta (POS)",   mobileLabel: "Venta",      perm: "sales.view",      color: "from-emerald-500 to-emerald-700" },
    { key: "Catálogo",      label: "Catálogo",      mobileLabel: "Catálogo",   perm: "products.view",   color: "from-violet-500 to-violet-700" },
    { key: "Clientes",      label: "Clientes",      mobileLabel: "Clientes",   perm: "customers.view",  color: "from-sky-500 to-sky-700" },
    { key: "Inventario",    label: "Inventario",    mobileLabel: "Inventario", perm: "inventory.view",  color: "from-amber-500 to-amber-700" },
    { key: "Compras",       label: "Compras",       mobileLabel: "Compras",    perm: "purchases.view",  color: "from-orange-500 to-orange-700" },
    { key: "Contabilidad",  label: "Contabilidad",  mobileLabel: "Contab.",    perm: "accounting.view", color: "from-green-500 to-green-700" },
    { key: "Reportes",      label: "Reportes",      mobileLabel: "Reportes",   perm: "reports.view",    color: "from-indigo-500 to-indigo-700" },
    // Deja de ser exclusivo del admin: con el permiso `employees` un encargado gestiona el
    // personal de SU sucursal. El backend es el que impone ese recorte —y que no pueda crear
    // administradores—; acá solo se decide a quién se le muestra el módulo.
    { key: "Empleados",     label: "Empleados",     mobileLabel: "Usuarios",   perm: "employees.view",  color: "from-pink-500 to-pink-700" },
    { key: "Empresas",      label: "Empresas",      mobileLabel: "Empresas",   superuserOnly: true, color: "from-rose-500 to-rose-700" },
    { key: "Configuración", label: "Configuración", mobileLabel: "Config.",    perm: "config.view",     color: "from-slate-500 to-slate-700" },
];

// Se conserva solo por compatibilidad con pantallas viejas: la matriz de Roles se dibuja
// con el catálogo que publica el backend (GET /employees/permissions).
export const PERM_LABELS = [
    { key: "sales",      label: "Ventas (POS)" },
    { key: "products",   label: "Catálogo / Productos" },
    { key: "customers",  label: "Clientes" },
    { key: "inventory",  label: "Inventario" },
    { key: "purchases",  label: "Compras" },
    { key: "accounting", label: "Contabilidad" },
    { key: "reports",    label: "Reportes" },
    // Gestionar el personal de su propia sucursal. Nunca alcanza para tocar usuarios de otra
    // sucursal ni para crear administradores: eso lo bloquea el backend.
    { key: "employees",  label: "Usuarios de su sucursal" },
    { key: "config",     label: "Configuración" },
];
