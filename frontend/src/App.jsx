import { useState } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { CartProvider, useCart } from "./context/CartContext";
import { useTheme } from "./hooks/useTheme";
import LoginScreen     from "./components/LoginScreen";
import EmpleadosPage   from "./pages/EmpleadosPage";
import CobroPage       from "./pages/CobroPage";
import CatalogPage     from "./pages/CatalogPage";
import ComprasPage     from "./pages/ComprasPage";
import InventarioPage  from "./pages/InventarioPage";
import ClientesPage    from "./pages/ClientesPage";
import ContabilidadPage from "./pages/ContabilidadPage";
import ConfigPage      from "./pages/ConfigPage";

const ROLE_COLORS = {
  admin:     "text-danger border-danger/40 bg-danger/10",
  manager:   "text-warning border-warning/40 bg-warning/10",
  cashier:   "text-success border-success/40 bg-success/10",
  warehouse: "text-info border-info/40 bg-info/10",
};

const ALL_TABS = [
  { key:"Cobro",         label:"Cobro",         icon:"🛒", perm:"sales"     },
  { key:"Catálogo",      label:"Catálogo",       icon:"📦", perm:"products"  },
  { key:"Compras",       label:"Compras",        icon:"🛍", perm:"products"  },
  { key:"Inventario",    label:"Inventario",     icon:"🏭", perm:"inventory" },
  { key:"Clientes",      label:"Clientes",       icon:"👥", perm:"customers" },
  { key:"Contabilidad",  label:"Contabilidad",   icon:"📊", perm:"sales"     },
  { key:"Empleados",     label:"Empleados",      icon:"👤", perm:"admin"     },
  { key:"Configuración", label:"Configuración",  icon:"⚙️", perm:"config"    },
];

function NavTab({ t, active, onGo }) {
  const isActive = active === t.key;
  return (
    <button
      onClick={() => onGo(t.key)}
      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-300 shrink-0
        ${isActive
          ? "bg-brand-500 text-brand-900 shadow-lg shadow-brand-500/20 scale-105"
          : "text-content-subtle hover:bg-surface-3 dark:hover:bg-white/5 hover:text-content dark:hover:text-white"
        }`}
    >
      <span className="text-xl leading-none">{t.icon}</span>
      <span className="hidden lg:inline-block tracking-tight">{t.label}</span>
    </button>
  );
}

function PosApp() {
  const { employee, authChecked, login, logout, can, notification, storeName, settings } = useApp();
  const { setReceipt } = useCart();
  const { dark, toggle } = useTheme();
  const [tab, setTab] = useState("Cobro");

  const visibleTabs = ALL_TABS.filter(t => {
    if (t.perm === "admin")     return employee?.permissions?.all;
    if (t.perm === "config")    return can("config") || employee?.permissions?.all;
    if (t.perm === "inventory") return can("inventory") || employee?.permissions?.all;
    return can(t.perm);
  });

  const goTab = (key) => { setTab(key); if (key === "Cobro") setReceipt(null); };

  if (!authChecked) return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 dark:bg-surface-dark">
      <div className="flex items-center gap-3 text-content-muted dark:text-content-dark-muted">
        <svg className="w-5 h-5 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <span className="text-base font-medium tracking-wide">Cargando...</span>
      </div>
    </div>
  );

  if (!employee) return <LoginScreen onLogin={login} />;

  const roleClass = ROLE_COLORS[employee.role] || "text-content-muted border-border bg-surface-3 dark:bg-surface-dark-3";

  return (
    <div className="min-h-screen bg-surface-2 dark:bg-surface-dark text-content dark:text-content-dark font-sans">

      {/* Toast de notificación */}
      {notification && (
        <div className={`fixed top-4 right-4 z-[9999] flex items-center gap-2 px-4 py-3 rounded-lg shadow-card-lg text-white text-sm font-medium
          ${notification.type === "err" ? "bg-danger" : "bg-success"}`}>
          {notification.type === "err"
            ? <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
            : <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
          }
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white dark:bg-surface-dark-2 border-b border-border dark:border-border-dark shadow-card">
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-2xl mx-auto">

          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0 mr-2">
            {settings.logo_url
              ? <img src={settings.logo_url} alt="logo" className="h-8 w-auto object-contain" />
              : <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                  </svg>
                </div>
            }
            <span className="hidden md:block text-base font-bold text-content dark:text-content-dark tracking-tight">
              {storeName}
            </span>
          </div>

          {/* Tabs — scrollable */}
          <nav className="flex items-center gap-2 overflow-x-auto flex-1 py-1 px-2 scrollbar-hide no-scrollbar">
            {visibleTabs.map(t => (
              <NavTab key={t.key} t={t} active={tab} onGo={goTab} />
            ))}
          </nav>

          {/* Usuario + acciones */}
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-semibold text-content dark:text-content-dark leading-tight">
                {employee.full_name}
              </div>
              <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded border ${roleClass}`}>
                {employee.role_label || employee.role}
              </span>
            </div>

            {/* Toggle dark/light */}
            <button onClick={toggle} className="btn-ghost p-2 rounded-lg"
              title={dark ? "Modo claro" : "Modo oscuro"}>
              {dark
                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
              }
            </button>

            <button onClick={logout}
              className="btn-sm btn-secondary hidden sm:flex">
              Salir
            </button>
            <button onClick={logout} className="btn-ghost p-2 rounded-lg sm:hidden"
              title="Salir">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className={tab === "Cobro" ? "w-full" : "max-w-screen-2xl mx-auto px-4 py-5"}>
        {tab === "Cobro"          && <CobroPage />}
        {tab === "Catálogo"       && <CatalogPage />}
        {tab === "Compras"        && <ComprasPage />}
        {tab === "Inventario"     && <InventarioPage />}
        {tab === "Clientes"       && <ClientesPage />}
        {tab === "Contabilidad"   && <ContabilidadPage />}
        {tab === "Empleados"      && <EmpleadosPage />}
        {tab === "Configuración"  && <ConfigPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <CartProvider>
        <PosApp />
      </CartProvider>
    </AppProvider>
  );
}
