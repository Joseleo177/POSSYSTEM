import { useState, useEffect } from "react";
import { api } from "../services/api";

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
      <div className="flex flex-wrap gap-2 mb-5">
        {SECTIONS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={
              section === key
                ? "btn-sm bg-warning text-surface-dark border border-warning font-bold"
                : "btn-sm bg-transparent text-content-muted dark:text-content-dark-muted border border-border dark:border-border-dark hover:border-warning/60 hover:text-warning"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── General ── */}
      {section === "general" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
          {/* Store data card */}
          <div className="card-md p-4">
            <div className="text-xs font-bold text-warning uppercase tracking-widest mb-4">
              DATOS DE LA TIENDA
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {FIELDS.map(([key, label]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    value={settings[key] || ""}
                    onChange={e => setSettings(p => ({ ...p, [key]: e.target.value }))}
                    className="input"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={saveSettings}
              disabled={loading}
              className={`btn-sm btn-primary ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {loading ? "Guardando..." : "Guardar configuración"}
            </button>
          </div>

          {/* Logo card */}
          <div className="card-md p-4">
            <div className="text-xs font-bold text-warning uppercase tracking-widest mb-4">
              LOGO
            </div>
            <label className="cursor-pointer block">
              <div className="w-full h-40 bg-surface-2 dark:bg-surface-dark border-2 border-dashed border-border dark:border-border-dark rounded-lg flex items-center justify-center overflow-hidden mb-2.5 transition-colors duration-150 hover:border-brand-400 dark:hover:border-brand-400">
                {settings.logo_url
                  ? <img src={settings.logo_url} alt="logo" className="max-w-full max-h-full object-contain" />
                  : <div className="text-center text-content-muted dark:text-content-dark-muted">
                      <div className="text-3xl">🏪</div>
                      <div className="text-xs mt-1.5">Subir logo</div>
                    </div>
                }
              </div>
              <input type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
            </label>
            <div className="text-2xs text-content-muted dark:text-content-dark-muted text-center">
              JPG, PNG o WebP · Máx. 5MB
            </div>
          </div>
        </div>
      )}

      {/* ── Monedas ── */}
      {section === "currencies" && (
        <div>
          {/* Base currency banner */}
          {base && (
            <div className="flex items-center gap-3 bg-success/10 border border-success/40 rounded-lg px-4 py-3 mb-5">
              <span className="text-lg">🏠</span>
              <div>
                <div className="font-bold text-success text-sm">
                  Moneda base: {base.symbol} {base.code} — {base.name}
                </div>
                <div className="text-xs text-content-muted dark:text-content-dark-muted mt-0.5">
                  Todos los precios se almacenan en esta moneda. El tipo de cambio siempre es 1.0
                </div>
              </div>
            </div>
          )}

          {/* Active currencies card */}
          <div className="card-md p-4 mb-5 overflow-x-auto">
            <div className="flex items-center justify-between mb-3.5 min-w-[600px]">
              <div className="text-xs font-bold text-warning uppercase tracking-widest">
                MONEDAS ACTIVAS
              </div>
              <div className="flex items-center gap-2.5">
                {lastRefresh && (
                  <span className="text-2xs text-content-muted dark:text-content-dark-muted">
                    Actualizado: {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
                <button
                  onClick={autoRefreshRates}
                  disabled={refreshing}
                  className={`btn-sm border border-success/60 font-bold ${
                    refreshing
                      ? "bg-success/5 text-content-muted dark:text-content-dark-muted cursor-not-allowed opacity-60"
                      : "bg-success/10 text-success hover:bg-success/20"
                  }`}
                >
                  {refreshing ? "⟳ Consultando..." : "⟳ Auto-actualizar tasas"}
                </button>
              </div>
            </div>
            <table className="table-pos min-w-[600px]">
              <thead>
                <tr>
                  {["Código", "Nombre", "Símbolo", "Tipo de cambio (1 USD =)", "Estado", "Acción"].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currencies.map((c) => (
                  <tr key={c.id}>
                    <td className="font-bold text-warning">{c.code}</td>
                    <td>{c.name}</td>
                    <td className="text-content-muted dark:text-content-dark-muted">{c.symbol}</td>
                    <td>
                      {c.is_base
                        ? <span className="text-content-muted dark:text-content-dark-muted">1.000000 (base)</span>
                        : <RateEditor currency={c} onSave={updateRate} />
                      }
                    </td>
                    <td>
                      <span className={`text-xs font-medium ${c.active ? "text-success" : "text-danger"}`}>
                        {c.active ? "● Activa" : "○ Inactiva"}
                      </span>
                    </td>
                    <td>
                      {!c.is_base && (
                        <button
                          onClick={() => api.currencies.toggle(c.id).then(load).catch(e => notify(e.message, "err"))}
                          className={`btn-sm border font-medium ${
                            c.active
                              ? "border-danger/60 text-danger bg-transparent hover:bg-danger/10"
                              : "border-success/60 text-success bg-transparent hover:bg-success/10"
                          }`}
                        >
                          {c.active ? "Desactivar" : "Activar"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add currency card */}
          <div className="card-md p-4">
            <div className="text-xs font-bold text-warning uppercase tracking-widest mb-3.5">
              + AGREGAR MONEDA
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(4,1fr)_auto] gap-2.5 items-end">
              {[
                ["Código (ej. EUR)", "code"],
                ["Nombre",          "name"],
                ["Símbolo",         "symbol"],
                ["Tipo de cambio vs USD", "exchange_rate"],
              ].map(([label, key]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    value={newCurrency[key]}
                    onChange={e => setNewCurrency(p => ({ ...p, [key]: e.target.value }))}
                    type={key === "exchange_rate" ? "number" : "text"}
                    className="input"
                  />
                </div>
              ))}
              <button onClick={addCurrency} className="btn-sm btn-primary whitespace-nowrap lg:h-[38px]">
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
    <span
      onClick={() => setEditing(true)}
      className="cursor-pointer text-info border-b border-dashed border-info/50 hover:text-blue-400 transition-colors"
    >
      {parseFloat(currency.exchange_rate).toFixed(6)}
    </span>
  );

  return (
    <div className="flex gap-1.5 items-center">
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        type="number"
        step="0.000001"
        className="input-sm w-28"
      />
      <button
        onClick={() => { onSave(currency.id, val); setEditing(false); }}
        className="btn-sm btn-primary px-2.5"
      >
        ✓
      </button>
      <button
        onClick={() => setEditing(false)}
        className="btn-sm btn-secondary px-2.5"
      >
        ✕
      </button>
    </div>
  );
}
