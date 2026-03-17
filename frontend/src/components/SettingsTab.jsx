import { useState, useEffect } from "react";
import { api } from "../services/api";

const inp = {
  width: "100%", background: "#0f0f0f", border: "1px solid #333",
  color: "#e8e0d0", padding: "8px 10px", borderRadius: 4,
  fontFamily: "inherit", fontSize: 13, boxSizing: "border-box",
};

const SECTIONS = [
  ["general",    "⚙ General"],
  ["currencies", "💱 Monedas"],
];

const FIELDS = [
  ["store_name",     "Nombre de la tienda"],
  ["store_address",  "Dirección"],
  ["store_phone",    "Teléfono"],
  ["store_email",    "Correo electrónico"],
  ["tax_name",       "Nombre del impuesto (ej. IVA)"],
  ["tax_rate",       "Tasa de impuesto (%)"],
  ["receipt_footer", "Pie de recibo"],
];

export default function SettingsTab({ notify }) {
  const [settings, setSettings]       = useState({});
  const [currencies, setCurrencies]   = useState([]);
  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [section, setSection]         = useState("general");
  const [newCurrency, setNewCurrency] = useState({ code:"", name:"", symbol:"", exchange_rate:"" });

  const load = async () => {
    try {
      const [sRes, cRes] = await Promise.all([
        api.settings.getAll(),
        api.currencies.getAll(),
      ]);
      setSettings(sRes.data);
      setCurrencies(cRes.data);
    } catch (e) { notify(e.message, "err"); }
  };

  useEffect(() => { load(); }, []);

  // ── Settings ───────────────────────────────────────────────
  const saveSettings = async () => {
    setLoading(true);
    try {
      const { logo_url, logo_filename, ...rest } = settings;
      await api.settings.update(rest);
      notify("Configuración guardada ✓");
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await api.settings.uploadLogo(file);
      setSettings(p => ({ ...p, logo_url: res.logo_url }));
      notify("Logo actualizado ✓");
    } catch (e) { notify(e.message, "err"); }
  };

  // ── Monedas ────────────────────────────────────────────────
  const updateRate = async (id, rate) => {
    try {
      await api.currencies.updateRate(id, { exchange_rate: parseFloat(rate) });
      notify("Tipo de cambio actualizado ✓");
      await load();
    } catch (e) { notify(e.message, "err"); }
  };

  const autoRefreshRates = async () => {
    setRefreshing(true);
    try {
      const res = await api.currencies.refreshRates();
      const names = res.updated.map(u => `${u.code}: ${parseFloat(u.rate).toFixed(4)}`).join(" | ");
      notify(res.updated.length ? `Tasas actualizadas ✓  ${names}` : "Sin cambios nuevos");
      setLastRefresh(new Date());
      setCurrencies(res.data);
    } catch (e) { notify(e.message || "Error al consultar la API de tasas", "err"); }
    finally { setRefreshing(false); }
  };

  const addCurrency = async () => {
    const { code, name, symbol, exchange_rate } = newCurrency;
    if (!code || !name || !symbol || !exchange_rate) return notify("Completa todos los campos", "err");
    try {
      await api.currencies.create({ ...newCurrency, exchange_rate: parseFloat(exchange_rate) });
      notify("Moneda agregada ✓");
      setNewCurrency({ code:"", name:"", symbol:"", exchange_rate:"" });
      await load();
    } catch (e) { notify(e.message, "err"); }
  };

  const base = currencies.find(c => c.is_base);

  return (
    <div>
      {/* Section tabs */}
      <div style={{ display:"flex",gap:8,marginBottom:20,flexWrap:"wrap" }}>
        {SECTIONS.map(([key,label]) => (
          <button key={key} onClick={() => setSection(key)}
            style={{ background:section===key?"#f0a500":"transparent",color:section===key?"#0f0f0f":"#888",border:`1px solid ${section===key?"#f0a500":"#333"}`,padding:"7px 18px",borderRadius:4,fontFamily:"inherit",fontSize:12,fontWeight:"bold",cursor:"pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── General ── */}
      {section === "general" && (
        <div style={{ display:"grid",gridTemplateColumns:"1fr 260px",gap:20 }}>
          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18 }}>
            <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:16 }}>DATOS DE LA TIENDA</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 }}>
              {FIELDS.map(([key,label]) => (
                <div key={key}>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>{label}</div>
                  <input value={settings[key]||""} onChange={e => setSettings(p => ({...p,[key]:e.target.value}))} style={inp} />
                </div>
              ))}
            </div>
            <button onClick={saveSettings} disabled={loading}
              style={{ background:"#f0a500",color:"#0f0f0f",border:"none",padding:"9px 24px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:13 }}>
              {loading?"Guardando...":"Guardar configuración"}
            </button>
          </div>

          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18 }}>
            <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:16 }}>LOGO</div>
            <label style={{ cursor:"pointer",display:"block" }}>
              <div style={{ width:"100%",height:160,background:"#111",border:"2px dashed #333",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",marginBottom:10 }}
                onMouseEnter={e => e.currentTarget.style.borderColor="#f0a500"}
                onMouseLeave={e => e.currentTarget.style.borderColor="#333"}>
                {settings.logo_url
                  ? <img src={settings.logo_url} alt="logo" style={{ maxWidth:"100%",maxHeight:"100%",objectFit:"contain" }} />
                  : <div style={{ textAlign:"center",color:"#444" }}>
                      <div style={{ fontSize:32 }}>🏪</div>
                      <div style={{ fontSize:11,marginTop:6 }}>Subir logo</div>
                    </div>
                }
              </div>
              <input type="file" accept="image/*" onChange={uploadLogo} style={{ display:"none" }} />
            </label>
            <div style={{ fontSize:11,color:"#555",textAlign:"center" }}>JPG, PNG o WebP · Máx. 5MB</div>
          </div>
        </div>
      )}

      {/* ── Monedas ── */}
      {section === "currencies" && (
        <div>
          {base && (
            <div style={{ background:"#1a2b1a",border:"1px solid #27ae60",borderRadius:6,padding:"12px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:12 }}>
              <span style={{ fontSize:18 }}>🏠</span>
              <div>
                <div style={{ fontWeight:"bold",color:"#27ae60",fontSize:13 }}>Moneda base: {base.symbol} {base.code} — {base.name}</div>
                <div style={{ fontSize:11,color:"#555" }}>Todos los precios se almacenan en esta moneda. El tipo de cambio siempre es 1.0</div>
              </div>
            </div>
          )}

          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18,marginBottom:20 }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
              <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2 }}>MONEDAS ACTIVAS</div>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                {lastRefresh && <span style={{ fontSize:10,color:"#444" }}>Actualizado: {lastRefresh.toLocaleTimeString()}</span>}
                <button onClick={autoRefreshRates} disabled={refreshing}
                  style={{ background:refreshing?"#1a3a2a":"#1a2b1a",color:refreshing?"#555":"#27ae60",border:"1px solid #27ae60",padding:"5px 14px",borderRadius:4,fontFamily:"inherit",fontSize:11,fontWeight:"bold",cursor:refreshing?"not-allowed":"pointer" }}>
                  {refreshing?"⟳ Consultando...":"⟳ Auto-actualizar tasas"}
                </button>
              </div>
            </div>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:"2px solid #f0a500",color:"#f0a500" }}>
                  {["Código","Nombre","Símbolo","Tipo de cambio (1 USD =)","Estado","Acción"].map(h =>
                    <th key={h} style={{ textAlign:"left",padding:"8px 12px",fontSize:11,letterSpacing:1 }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {currencies.map((c,i) => (
                  <tr key={c.id} style={{ background:i%2===0?"#111":"transparent",borderBottom:"1px solid #1e1e1e" }}>
                    <td style={{ padding:"10px 12px",fontWeight:"bold",color:"#f0a500" }}>{c.code}</td>
                    <td style={{ padding:"10px 12px" }}>{c.name}</td>
                    <td style={{ padding:"10px 12px",color:"#888" }}>{c.symbol}</td>
                    <td style={{ padding:"10px 12px" }}>
                      {c.is_base
                        ? <span style={{ color:"#555" }}>1.000000 (base)</span>
                        : <RateEditor currency={c} onSave={updateRate} />
                      }
                    </td>
                    <td style={{ padding:"10px 12px" }}>
                      <span style={{ color:c.active?"#27ae60":"#e74c3c",fontSize:11 }}>{c.active?"● Activa":"○ Inactiva"}</span>
                    </td>
                    <td style={{ padding:"10px 12px" }}>
                      {!c.is_base && (
                        <button onClick={() => api.currencies.toggle(c.id).then(load).catch(e => notify(e.message,"err"))}
                          style={{ background:"transparent",border:`1px solid ${c.active?"#e74c3c":"#27ae60"}`,color:c.active?"#e74c3c":"#27ae60",padding:"3px 10px",borderRadius:3,fontFamily:"inherit",fontSize:11,cursor:"pointer" }}>
                          {c.active?"Desactivar":"Activar"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18 }}>
            <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:14 }}>+ AGREGAR MONEDA</div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr) auto",gap:10,alignItems:"end" }}>
              {[["Código (ej. EUR)","code"],["Nombre","name"],["Símbolo","symbol"],["Tipo de cambio vs USD","exchange_rate"]].map(([label,key]) => (
                <div key={key}>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>{label}</div>
                  <input value={newCurrency[key]} onChange={e => setNewCurrency(p => ({...p,[key]:e.target.value}))}
                    type={key==="exchange_rate"?"number":"text"} style={inp} />
                </div>
              ))}
              <button onClick={addCurrency}
                style={{ background:"#f0a500",color:"#0f0f0f",border:"none",padding:"8px 16px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:13,whiteSpace:"nowrap" }}>
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Editor inline de tipo de cambio ──────────────────────────
function RateEditor({ currency, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(currency.exchange_rate);
  if (!editing) return (
    <span onClick={() => setEditing(true)}
      style={{ cursor:"pointer",color:"#5dade2",borderBottom:"1px dashed #2980b9" }}>
      {parseFloat(currency.exchange_rate).toFixed(6)}
    </span>
  );
  return (
    <div style={{ display:"flex",gap:6,alignItems:"center" }}>
      <input value={val} onChange={e => setVal(e.target.value)} type="number" step="0.000001"
        style={{ width:110,background:"#0f0f0f",border:"1px solid #f0a500",color:"#e8e0d0",padding:"4px 8px",borderRadius:3,fontFamily:"inherit",fontSize:12 }} />
      <button onClick={() => { onSave(currency.id, val); setEditing(false); }}
        style={{ background:"#f0a500",color:"#0f0f0f",border:"none",padding:"4px 10px",borderRadius:3,fontFamily:"inherit",fontSize:11,fontWeight:"bold",cursor:"pointer" }}>✓</button>
      <button onClick={() => setEditing(false)}
        style={{ background:"transparent",border:"1px solid #333",color:"#888",padding:"4px 8px",borderRadius:3,fontFamily:"inherit",fontSize:11,cursor:"pointer" }}>✕</button>
    </div>
  );
}