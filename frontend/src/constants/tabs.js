// src/constants/tabs.js
export const ALL_TABS = [
    { key: "Dashboard", label: "Dashboard", mobileLabel: "Inicio", perms: ["sales", "reports", "inventory", "config"] },
    { key: "Cobro", label: "Venta (POS)", mobileLabel: "Venta", perms: ["sales"] },
    { key: "Catálogo", label: "Catálogo", mobileLabel: "Catálogo", perms: ["products", "inventory", "config"] },
    { key: "Clientes", label: "Clientes", mobileLabel: "Clientes", perms: ["customers"] },
    { key: "Inventario", label: "Inventario", mobileLabel: "Inventario", perms: ["inventory"] },
    { key: "Compras", label: "Compras", mobileLabel: "Compras", perms: ["inventory"] },
    { key: "Contabilidad", label: "Contabilidad", mobileLabel: "Contab.", perms: ["sales", "reports", "config"] },
    { key: "Reportes", label: "Reportes", mobileLabel: "Reportes", perms: ["reports", "config", "inventory"] },
    { key: "Empleados", label: "Empleados", mobileLabel: "Staff", adminOnly: true },
    { key: "Empresas", label: "Empresas", mobileLabel: "Empresas", superuserOnly: true },
    { key: "Configuración", label: "Configuración", mobileLabel: "Config.", perms: ["config"] },
];
