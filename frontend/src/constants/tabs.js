// src/constants/tabs.js
export const ALL_TABS = [
    { key: "Dashboard",     label: "Dashboard",     mobileLabel: "Inicio",     perm: null },
    { key: "Cobro",         label: "Venta (POS)",   mobileLabel: "Venta",      perm: "sales" },
    { key: "Catálogo",      label: "Catálogo",      mobileLabel: "Catálogo",   perm: "products" },
    { key: "Clientes",      label: "Clientes",      mobileLabel: "Clientes",   perm: "customers" },
    { key: "Inventario",    label: "Inventario",    mobileLabel: "Inventario", perm: "inventory" },
    { key: "Compras",       label: "Compras",       mobileLabel: "Compras",    perm: "purchases" },
    { key: "Contabilidad",  label: "Contabilidad",  mobileLabel: "Contab.",    perm: "accounting" },
    { key: "Reportes",      label: "Reportes",      mobileLabel: "Reportes",   perm: "reports" },
    { key: "Empleados",     label: "Empleados",     mobileLabel: "Usuarios",   adminOnly: true },
    { key: "Empresas",      label: "Empresas",      mobileLabel: "Empresas",   superuserOnly: true },
    { key: "Configuración", label: "Configuración", mobileLabel: "Config.",    perm: "config" },
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
