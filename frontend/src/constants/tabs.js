// src/constants/tabs.js
export const ALL_TABS = [
    { key: "Dashboard",     label: "Dashboard",     mobileLabel: "Inicio",     perm: null,         color: "from-teal-500 to-teal-700" },
    { key: "Cobro",         label: "Venta (POS)",   mobileLabel: "Venta",      perm: "sales",      color: "from-emerald-500 to-emerald-700" },
    { key: "Catálogo",      label: "Catálogo",      mobileLabel: "Catálogo",   perm: "products",   color: "from-violet-500 to-violet-700" },
    { key: "Clientes",      label: "Clientes",      mobileLabel: "Clientes",   perm: "customers",  color: "from-sky-500 to-sky-700" },
    { key: "Inventario",    label: "Inventario",    mobileLabel: "Inventario", perm: "inventory",  color: "from-amber-500 to-amber-700" },
    { key: "Compras",       label: "Compras",       mobileLabel: "Compras",    perm: "purchases",  color: "from-orange-500 to-orange-700" },
    { key: "Contabilidad",  label: "Contabilidad",  mobileLabel: "Contab.",    perm: "accounting", color: "from-green-500 to-green-700" },
    { key: "Reportes",      label: "Reportes",      mobileLabel: "Reportes",   perm: "reports",    color: "from-indigo-500 to-indigo-700" },
    { key: "Empleados",     label: "Empleados",     mobileLabel: "Usuarios",   adminOnly: true,    color: "from-pink-500 to-pink-700" },
    { key: "Empresas",      label: "Empresas",      mobileLabel: "Empresas",   superuserOnly: true, color: "from-rose-500 to-rose-700" },
    { key: "Configuración", label: "Configuración", mobileLabel: "Config.",    perm: "config",     color: "from-slate-500 to-slate-700" },
];

export const PERM_LABELS = [
    { key: "sales",      label: "Ventas (POS)" },
    { key: "products",   label: "Catálogo / Productos" },
    { key: "customers",  label: "Clientes" },
    { key: "inventory",  label: "Inventario" },
    { key: "purchases",  label: "Compras" },
    { key: "accounting", label: "Contabilidad" },
    { key: "reports",    label: "Reportes" },
    { key: "config",     label: "Configuración" },
];
