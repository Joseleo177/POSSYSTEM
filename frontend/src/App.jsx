import { useEffect, useState } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { CartProvider, useCart } from "./context/CartContext";
import { useTheme } from "./hooks/useTheme";
import LoginScreen     from "./components/LoginScreen";
import DashboardPage   from "./pages/DashboardPage";
import EmpleadosPage   from "./pages/EmpleadosPage";
import CobroPage       from "./pages/CobroPage";
import CatalogPage     from "./pages/CatalogPage";
import ComprasPage     from "./pages/ComprasPage";
import InventarioPage  from "./pages/InventarioPage";
import ClientesPage    from "./pages/ClientesPage";
import ContabilidadPage from "./pages/ContabilidadPage";
import ConfigPage      from "./pages/ConfigPage";
import ReportesPage    from "./pages/ReportesPage";

const ROLE_COLORS = {
  admin:     "text-danger border-danger/40 bg-danger/10",
  manager:   "text-warning border-warning/40 bg-warning/10",
  cashier:   "text-success border-success/40 bg-success/10",
  warehouse: "text-info border-info/40 bg-info/10",
};

const TAB_ICONS = {
  Dashboard:     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zm0 7a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5zm-10 2a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3z"/></svg>,
  Cobro:         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>,
  "Catálogo":    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>,
  Clientes:      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  Inventario:    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>,
  Compras:       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>,
  Contabilidad:  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  Reportes:      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>,
  Empleados:     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>,
  "Configuración": <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
};

const ALL_TABS = [
  { key:"Dashboard",     label:"Dashboard",      mobileLabel:"Inicio",  perms:["sales", "reports", "inventory", "config"] },
  { key:"Cobro",         label:"Venta (POS)",    mobileLabel:"Venta",   perms:["sales"] },
  { key:"Catálogo",      label:"Catálogo",       mobileLabel:"Catálogo", perms:["products", "inventory", "config"] },
  { key:"Clientes",      label:"Clientes",       mobileLabel:"Clientes", perms:["customers"] },
  { key:"Inventario",    label:"Inventario",     mobileLabel:"Inventario", perms:["inventory"] },
  { key:"Compras",       label:"Compras",        mobileLabel:"Compras", perms:["inventory"] },
  { key:"Contabilidad",  label:"Contabilidad",   mobileLabel:"Contab.", perms:["sales", "reports", "config"] },
  { key:"Reportes",      label:"Reportes",       mobileLabel:"Reportes", perms:["reports", "config", "inventory"] },
  { key:"Empleados",     label:"Empleados",      mobileLabel:"Staff",   adminOnly:true },
  { key:"Configuración", label:"Configuración",  mobileLabel:"Config.", perms:["config"] },
];

/* Desktop sidebar tab */
function NavTab({ t, active, onGo, collapsed }) {
  const isActive = active === t.key;
  return (
    <button
      onClick={() => onGo(t.key)}
      title={t.label}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200
        ${isActive
          ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20"
          : "text-content-subtle hover:bg-surface-3 dark:hover:bg-white/5 hover:text-content dark:hover:text-white"
        } ${collapsed ? "justify-center" : ""}`}
    >
      <span className={`shrink-0 ${isActive ? "scale-110" : ""} transition-transform`}>{TAB_ICONS[t.key]}</span>
      {!collapsed && <span className="tracking-tight truncate">{t.label}</span>}
    </button>
  );
}

/* Mobile bottom-bar tab */
function MobileTab({ t, active, onGo }) {
  const isActive = active === t.key;
  return (
    <button
      onClick={() => onGo(t.key)}
      className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1.5 px-1 rounded-xl transition-all
        ${isActive
          ? "text-brand-500"
          : "text-content-subtle/60 dark:text-content-dark-muted/60"
        }`}
    >
      <span className={`transition-transform ${isActive ? "scale-110" : ""}`}>{TAB_ICONS[t.key]}</span>
      <span className={`text-[9px] font-bold leading-none truncate max-w-[60px] ${isActive ? "font-black" : ""}`}>{t.mobileLabel}</span>
      {isActive && <span className="w-1 h-1 rounded-full bg-brand-500 mt-0.5" />}
    </button>
  );
}

function PosApp() {
  const { employee, authChecked, login, logout, can, notification, storeName, settings } = useApp();
  const { setReceipt } = useCart();
  const { dark, toggle } = useTheme();
  const [tab, setTab] = useState("Dashboard");

  const canAny = (perms = []) => perms.some((p) => can(p));

  const visibleTabs = ALL_TABS.filter((t) => {
    if (t.adminOnly) return !!employee?.permissions?.all;
    return canAny(t.perms);
  });

  const activeTabVisible = visibleTabs.some((t) => t.key === tab);
  const safeTab = activeTabVisible ? tab : (visibleTabs[0]?.key || "Dashboard");

  useEffect(() => {
    if (!activeTabVisible && visibleTabs.length) {
      setTab(visibleTabs[0].key);
    }
  }, [activeTabVisible, visibleTabs]);

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
    <div className="h-screen flex flex-col overflow-hidden bg-surface-2 dark:bg-surface-dark text-content dark:text-content-dark font-sans">

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

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-50 bg-white dark:bg-surface-dark-2 border-b border-border dark:border-border-dark shadow-card">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex items-center gap-2 shrink-0">
            {settings.logo_url
              ? <img src={settings.logo_url} alt="logo" className="h-7 w-auto object-contain" />
              : <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                  </svg>
                </div>
            }
            <span className="text-sm font-black text-content dark:text-content-dark tracking-tight">
              {visibleTabs.find(t => t.key === safeTab)?.mobileLabel || storeName}
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <button onClick={toggle} className="btn-ghost p-1.5 rounded-lg" title={dark ? "Modo claro" : "Modo oscuro"}>
              {dark
                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
              }
            </button>
            <button onClick={logout} className="btn-ghost p-1.5 rounded-lg" title="Salir">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-56 bg-white dark:bg-surface-dark-2 border-r border-border dark:border-border-dark shrink-0">
          {/* Logo + Store */}
          <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border dark:border-border-dark">
            {settings.logo_url
              ? <img src={settings.logo_url} alt="logo" className="h-8 w-auto object-contain" />
              : <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                  </svg>
                </div>
            }
            <span className="text-sm font-bold text-content dark:text-content-dark tracking-tight truncate">{storeName}</span>
          </div>

          {/* Nav tabs */}
          <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 scrollbar-hide">
            {visibleTabs.map(t => (
              <NavTab key={t.key} t={t} active={safeTab} onGo={goTab} />
            ))}
          </nav>

          {/* User + actions */}
          <div className="border-t border-border dark:border-border-dark p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-500 text-xs font-black shrink-0">
                {employee.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-content dark:text-content-dark truncate">{employee.full_name}</div>
                <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded border ${roleClass}`}>
                  {employee.role_label || employee.role}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggle} className="btn-ghost p-2 rounded-lg flex-1" title={dark ? "Modo claro" : "Modo oscuro"}>
                {dark
                  ? <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                  : <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
                }
              </button>
              <button onClick={logout} className="btn-ghost p-2 rounded-lg flex-1 text-danger" title="Salir">
                <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
              </button>
            </div>
          </div>
        </aside>

        {/* Contenido — ninguna página tiene scroll de página */}
        <main className="flex-1 min-h-0 w-full h-full overflow-hidden">
          {safeTab === "Dashboard"      && <DashboardPage />}
          {safeTab === "Cobro"          && <CobroPage />}
          {safeTab === "Catálogo"       && <CatalogPage />}
          {safeTab === "Compras"        && <ComprasPage />}
          {safeTab === "Inventario"     && <InventarioPage />}
          {safeTab === "Clientes"       && <ClientesPage />}
          {safeTab === "Contabilidad"   && <ContabilidadPage />}
          {safeTab === "Reportes"       && <ReportesPage />}
          {safeTab === "Empleados"      && <EmpleadosPage />}
          {safeTab === "Configuración"  && <ConfigPage />}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-2 border-t border-border dark:border-border-dark shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-around overflow-x-auto scrollbar-hide px-1 py-1 safe-area-bottom">
          {visibleTabs.map(t => (
            <MobileTab key={t.key} t={t} active={safeTab} onGo={goTab} />
          ))}
        </div>
      </nav>
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
