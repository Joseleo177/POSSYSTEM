import { useState } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { CartProvider, useCart } from "./context/CartContext";
import LoginScreen     from "./components/LoginScreen";
import EmpleadosPage from "./pages/EmpleadosPage";
import CobroPage        from "./pages/CobroPage";
import CatalogPage      from "./pages/CatalogPage";
import ComprasPage      from "./pages/ComprasPage";
import InventarioPage   from "./pages/InventarioPage";
import ClientesPage     from "./pages/ClientesPage";
import ContabilidadPage from "./pages/ContabilidadPage";
import ConfigPage       from "./pages/ConfigPage";

const ROLE_COLORS = { admin:"#e74c3c", manager:"#f0a500", cashier:"#27ae60", warehouse:"#5dade2" };

// Tabs con soporte de hijos (dropdown)
const ALL_TABS = [
  { key:"Cobro",        perm:"sales"     },
  { key:"Catálogo",     perm:"products"  },
  { key:"Compras",      perm:"products"  },
  { key:"Inventario",   perm:"inventory" },
  { key:"Clientes",     perm:"customers" },
  { key:"Contabilidad", perm:"sales"     },
  { key:"Empleados",    perm:"admin"     },
  { key:"Configuración", perm:"config" },
];

// ── Componente de tab ─────────────────────────────────────────
function NavTab({ t, active, onGo }) {
  const isActive = active === t.key;
  return (
    <button
      onClick={() => onGo(t.key)}
      style={{
        background: isActive ? "#f0a500" : "transparent",
        color:      isActive ? "#0f0f0f" : "#888",
        border:     `1px solid ${isActive ? "#f0a500" : "#333"}`,
        padding:    "6px 10px", borderRadius: 3, cursor: "pointer",
        fontFamily: "inherit", fontSize: 11, fontWeight: "bold",
        letterSpacing: 1, whiteSpace: "nowrap", flexShrink: 0,
      }}>
      {t.key.toUpperCase()}
    </button>
  );
}

// ── Layout principal ──────────────────────────────────────────
function PosApp() {
  const { employee, authChecked, login, logout, can, notification, notify, storeName, settings } = useApp();
  const { setReceipt } = useCart();

  const [tab, setTab] = useState("Cobro");

  const visibleTabs = ALL_TABS.filter(t => {
    if (t.perm === "admin")     return employee?.permissions?.all;
    if (t.perm === "config")    return can("config") || employee?.permissions?.all;
    if (t.perm === "inventory") return can("inventory") || employee?.permissions?.all;
    return can(t.perm);
  });

  const goTab = (key) => {
    setTab(key);
    if (key === "Cobro") setReceipt(null);
  };

  if (!authChecked) return (
    <div style={{ minHeight:"100vh", background:"#0f0f0f", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Courier New',monospace", color:"#f0a500", fontSize:16, letterSpacing:3 }}>
      CARGANDO...
    </div>
  );

  if (!employee) return <LoginScreen onLogin={login} />;

  return (
    <div style={{ fontFamily:"'Courier New',monospace", background:"#0f0f0f", minHeight:"100vh", color:"#e8e0d0" }}>
      <style>{`
        .pos-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;padding:10px 20px;background:#1a1a1a;border-bottom:2px solid #f0a500;}
        .pos-logo{display:flex;align-items:center;gap:8px;flex-shrink:0;}
        .pos-logo-name{font-size:15px;font-weight:bold;letter-spacing:3px;color:#f0a500;}
        .pos-tabs{display:flex;gap:4px;overflow-x:auto;flex-wrap:nowrap;flex:1;justify-content:center;padding:0 8px;}
        .pos-tabs::-webkit-scrollbar{height:3px;}
        .pos-tabs::-webkit-scrollbar-thumb{background:#444;border-radius:2px;}
        .pos-user{display:flex;align-items:center;gap:10px;flex-shrink:0;}
        .pos-content{padding:16px 20px;max-width:1400px;margin:0 auto;}
        .cobro-grid{display:grid;grid-template-columns:1fr 360px;gap:20px;align-items:start;}
        .cart-panel{position:sticky;top:12px;align-self:start;}
        .product-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
        .product-card-img{height:70px;width:100%;background:#111;display:flex;align-items:center;justify-content:center;overflow:hidden;}
        .cart-list{display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto;}
        .cart-item{display:flex;align-items:center;gap:6px;background:#111;border-radius:4px;padding:5px 8px;}
        .cart-item-name{flex:1;font-size:12px;line-height:1.3;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .cart-qty-input{width:44px;background:#1a1a1a;border:1px solid #333;color:#e8e0d0;padding:3px 4px;border-radius:3px;font-family:inherit;font-size:13px;font-weight:bold;text-align:center;}
        .cart-price{font-size:12px;color:#f0a500;min-width:54px;text-align:right;flex-shrink:0;}
        @media(max-width:900px){.product-grid{grid-template-columns:repeat(3,1fr);}}
        @media(max-width:768px){
          .pos-header{padding:8px 10px;}
          .pos-logo-name{font-size:12px;letter-spacing:1px;}
          .pos-tabs{order:3;width:100%;justify-content:flex-start;padding:0;}
          .pos-user{order:2;}
          .pos-content{padding:8px 8px;}
          .cobro-grid{grid-template-columns:1fr;}
          .cart-panel{position:static;}
          .product-grid{grid-template-columns:repeat(2,1fr);gap:5px;}
          .product-card-img{height:55px;}
          .cart-list{max-height:none;}
        }
        @media(max-width:480px){.pos-logo-name{display:none;}}
        * { box-sizing:border-box; }
        input:focus, select:focus { outline:1px solid #f0a500; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:#111; }
        ::-webkit-scrollbar-thumb { background:#333; border-radius:3px; }
      `}</style>

      {/* Notificación global */}
      {notification && (
        <div style={{ position:"fixed", top:16, right:16, zIndex:999, background:notification.type==="err"?"#c0392b":"#27ae60", color:"#fff", padding:"10px 20px", borderRadius:4, fontWeight:"bold", fontSize:13, boxShadow:"0 4px 20px rgba(0,0,0,.5)" }}>
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <div className="pos-header">
        <div className="pos-logo">
          {settings.logo_url
            ? <img src={settings.logo_url} alt="logo" style={{ height:28, objectFit:"contain" }} />
            : <span style={{ fontSize:18, color:"#f0a500" }}>▣</span>
          }
          <span className="pos-logo-name">{storeName.toUpperCase()}</span>
        </div>

        <div className="pos-tabs">
          {visibleTabs.map(t => (
            <NavTab key={t.key} t={t} active={tab} onGo={goTab} />
          ))}
        </div>

        <div className="pos-user">
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:12, fontWeight:"bold", color:"#e8e0d0" }}>{employee.full_name}</div>
            <div style={{ fontSize:10, padding:"1px 6px", borderRadius:3, display:"inline-block", background:(ROLE_COLORS[employee.role]||"#555")+"22", color:ROLE_COLORS[employee.role]||"#888", border:`1px solid ${(ROLE_COLORS[employee.role]||"#555")}44` }}>
              {employee.role_label || employee.role}
            </div>
          </div>
          <button onClick={logout}
            style={{ background:"transparent", border:"1px solid #333", color:"#555", padding:"5px 10px", borderRadius:3, fontFamily:"inherit", fontSize:11, cursor:"pointer" }}>
            Salir
          </button>
        </div>
      </div>

      {/* Contenido por tab */}
      <div className="pos-content">
        {tab === "Cobro"          && <CobroPage />}
        {tab === "Catálogo"       && <CatalogPage />}
        {tab === "Compras"        && <ComprasPage />}
        {tab === "Inventario"     && <InventarioPage />}
        {tab === "Clientes"       && <ClientesPage />}
        {tab === "Contabilidad"   && <ContabilidadPage />}
        {tab === "Empleados" && <EmpleadosPage />}
        {tab === "Configuración"  && <ConfigPage />}
      </div>
    </div>
  );
}

// ── Entry point con providers ─────────────────────────────────
export default function App() {
  return (
    <AppProvider>
      <CartProvider>
        <PosApp />
      </CartProvider>
    </AppProvider>
  );
}
