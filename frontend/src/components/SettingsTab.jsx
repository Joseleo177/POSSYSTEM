import { useState, useEffect } from "react";
import { api } from "../services/api";
import Page from "./ui/Page";
import { Button } from "./ui/Button";

const SECTIONS = [
    ["empresa", "Empresa"],
    ["factura", "Factura"],
    ["currencies", "Monedas"],
];

const FIELDS_EMPRESA = [
    ["store_name", "Nombre / Razón Social", "text", "Ej: Distribuidora El Sol C.A."],
    ["store_rif", "RIF", "text", "Ej: J-12345678-9"],
    ["store_slogan", "Slogan (opcional)", "text", "Ej: Calidad garantizada"],
    ["store_address", "Dirección fiscal", "text", "Av. Principal, Local 1"],
    ["store_city", "Ciudad / Estado", "text", "Caracas, Miranda"],
    ["store_phone", "Teléfono", "text", "0212-555-0000"],
    ["store_phone2", "Teléfono 2 (opcional)", "text", ""],
    ["store_email", "Correo electrónico", "email", ""],
    ["store_website", "Sitio web (opcional)", "text", "www.mitienda.com"],
];

const FIELDS_FACTURA = [
    ["tax_name", "Nombre del impuesto", "text", "Ej: IVA"],
    ["tax_rate", "Tasa de impuesto (%)", "number", "16"],
    ["receipt_footer", "Mensaje pie de factura", "text", "¡Gracias por su preferencia!"],
];

export default function SettingsTab({ notify }) {
    const [settings, setSettings] = useState({});
    const [currencies, setCurrencies] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [section, setSection] = useState("empresa");
    const [newCurrency, setNewCurrency] = useState({ code: "", name: "", symbol: "", exchange_rate: "" });

    const load = async () => {
        try {
            const [sRes, cRes] = await Promise.all([api.settings.getAll(), api.currencies.getAll()]);
            setSettings(sRes.data);
            setCurrencies(cRes.data);
        } catch (e) { notify(e.message, "err"); }
    };

    useEffect(() => { load(); }, []);

    const saveSettings = async () => {
        setLoading(true);
        try {
            const { logo_url, logo_filename, ...rest } = settings;
            await api.settings.update(rest);
            notify("Configuración guardada correctamente");
        } catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    };

    const uploadLogo = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const res = await api.settings.uploadLogo(file);
            setSettings(p => ({ ...p, logo_url: res.logo_url }));
            notify("Logo actualizado correctamente");
        } catch (e) { notify(e.message, "err"); }
    };

    const updateRate = async (id, rate) => {
        try {
            await api.currencies.updateRate(id, { exchange_rate: parseFloat(rate) });
            notify("Tipo de cambio actualizado correctamente");
            await load();
        } catch (e) { notify(e.message, "err"); }
    };

    const autoRefreshRates = async () => {
        setRefreshing(true);
        try {
            const res = await api.currencies.refreshRates();
            const names = res.updated.map(u => `${u.code}: ${parseFloat(u.rate).toFixed(4)}`).join(" | ");
            notify(res.updated.length ? `Tasas actualizadas: ${names}` : "Las tasas ya están al día");
            setLastRefresh(new Date());
            setCurrencies(res.data);
        } catch (e) { notify(e.message || "Error al consultar la API de tasas", "err"); }
        finally { setRefreshing(false); }
    };

    const addCurrency = async () => {
        try {
            await api.currencies.create({ ...newCurrency, exchange_rate: parseFloat(newCurrency.exchange_rate) });
            notify("Moneda agregada correctamente");
            setNewCurrency({ code: "", name: "", symbol: "", exchange_rate: "" });
            await load();
        } catch (e) { notify(e.message, "err"); }
    };

    const base = currencies.find(c => c.is_base);

    const subheader = (
        <div className="shrink-0 px-4 py-1.5 flex items-center gap-1 border-b border-border/20 dark:border-white/5 bg-surface-2/50 dark:bg-white/[0.02]">
            {SECTIONS.map(([key, label]) => (
                <button
                    key={key}
                    onClick={() => setSection(key)}
                    className={[
                        "px-4 py-1 rounded-full text-[11px] font-black uppercase tracking-wide transition-all",
                        section === key
                            ? "bg-brand-500 text-black shadow-sm"
                            : "text-content-muted dark:text-content-dark-muted hover:text-content dark:hover:text-white hover:bg-surface-3 dark:hover:bg-white/10",
                    ].join(" ")}
                >
                    {label}
                </button>
            ))}
        </div>
    );

    return (
        <Page module="MÓDULO DE SISTEMA" title="Configuración" subheader={subheader}>

            {/* ── Empresa ── */}
            {section === "empresa" && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3 py-2">
                    <div className="card-md p-5 space-y-5">
                        <div>
                            <div className="text-[11px] font-black text-warning uppercase tracking-wide mb-3">Identidad Legal</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {FIELDS_EMPRESA.slice(0, 3).map(([key, label, type, placeholder]) => (
                                    <div key={key} className={key === "store_name" ? "md:col-span-2" : ""}>
                                        <label className="label">{label}</label>
                                        <input type={type} placeholder={placeholder}
                                            value={settings[key] || ""}
                                            onChange={e => setSettings(p => ({ ...p, [key]: e.target.value }))}
                                            className="input" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="text-[11px] font-black text-info uppercase tracking-wide mb-3">Contacto y Ubicación</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {FIELDS_EMPRESA.slice(3).map(([key, label, type, placeholder]) => (
                                    <div key={key} className={key === "store_address" ? "md:col-span-2" : ""}>
                                        <label className="label">{label}</label>
                                        <input type={type} placeholder={placeholder}
                                            value={settings[key] || ""}
                                            onChange={e => setSettings(p => ({ ...p, [key]: e.target.value }))}
                                            className="input" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Button variant="primary" onClick={saveSettings} disabled={loading}>
                            {loading ? "Guardando..." : "Guardar datos de empresa"}
                        </Button>
                    </div>

                    <div className="space-y-4">
                        <div className="card-md p-4">
                            <div className="text-[11px] font-black text-warning uppercase tracking-wide mb-3">Logo</div>
                            <label className="cursor-pointer block">
                                <div className="w-full h-36 bg-surface-2 dark:bg-surface-dark border-2 border-dashed border-border dark:border-border-dark rounded-xl flex items-center justify-center overflow-hidden mb-2 hover:border-brand-400 transition-colors">
                                    {settings.logo_url
                                        ? <img src={settings.logo_url} alt="logo" className="max-w-full max-h-full object-contain p-2" />
                                        : <div className="text-center text-content-muted dark:text-content-dark-muted">
                                            <div className="text-3xl">🖼</div>
                                            <div className="text-xs mt-1">Subir logo</div>
                                        </div>
                                    }
                                </div>
                                <input type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
                            </label>
                            <div className="text-[11px] text-content-muted dark:text-content-dark-muted text-center">JPG, PNG o WebP · Máx. 5MB</div>
                        </div>

                        <div className="card-md p-4">
                            <div className="text-[11px] font-black text-content-muted dark:text-content-dark-muted uppercase tracking-wide mb-3">Preview encabezado</div>
                            <div className="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 text-center border border-border/30 dark:border-white/10">
                                {settings.logo_url && <img src={settings.logo_url} alt="logo" className="mx-auto mb-2 object-contain" />}
                                <div className="text-sm font-black text-gray-900 dark:text-white leading-tight">{settings.store_name || "NOMBRE DE LA EMPRESA"}</div>
                                {settings.store_rif && <div className="text-[11px] text-gray-500 mt-0.5">RIF: {settings.store_rif}</div>}
                                {settings.store_slogan && <div className="text-[11px] italic text-gray-400 mt-0.5">{settings.store_slogan}</div>}
                                {settings.store_address && <div className="text-[11px] text-gray-500 mt-1">{settings.store_address}</div>}
                                {(settings.store_city || settings.store_phone) && (
                                    <div className="text-[11px] text-gray-500">{[settings.store_city, settings.store_phone].filter(Boolean).join(" · ")}</div>
                                )}
                                {settings.store_email && <div className="text-[11px] text-gray-400">{settings.store_email}</div>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Factura ── */}
            {section === "factura" && (
                <div className="card-md p-5 max-w-xl mt-2">
                    <div className="text-[11px] font-black text-warning uppercase tracking-wide mb-4">Configuración de Factura</div>
                    <div className="space-y-3 mb-5">
                        {FIELDS_FACTURA.map(([key, label, type, placeholder]) => (
                            <div key={key}>
                                <label className="label">{label}</label>
                                <input type={type} placeholder={placeholder}
                                    value={settings[key] || ""}
                                    onChange={e => setSettings(p => ({ ...p, [key]: e.target.value }))}
                                    className="input" />
                            </div>
                        ))}
                    </div>
                    <Button variant="primary" onClick={saveSettings} disabled={loading}>
                        {loading ? "Guardando..." : "Guardar configuración"}
                    </Button>
                </div>
            )}

            {/* ── Monedas ── */}
            {section === "currencies" && (
                <div className="py-2">
                    {base && (
                        <div className="flex items-center gap-3 bg-success/10 border border-success/40 rounded-lg px-4 py-3 mb-5">
                            <div className="w-10 rounded-xl bg-success/20 flex items-center justify-center shrink-0">
                                <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                            </div>
                            <div>
                                <div className="font-bold text-success text-sm">Moneda base: {base.symbol} {base.code} — {base.name}</div>
                                <div className="text-xs text-content-muted dark:text-content-dark-muted mt-0.5">Todos los precios se almacenan en esta moneda. El tipo de cambio siempre es 1.0</div>
                            </div>
                        </div>
                    )}

                    <div className="card-md p-4 mb-5 overflow-x-auto">
                        <div className="flex items-center justify-between mb-3.5 min-w-[600px]">
                            <div className="text-[11px] font-black text-warning uppercase tracking-wide">Monedas Activas</div>
                            <div className="flex items-center gap-2.5">
                                {lastRefresh && (
                                    <span className="text-[11px] text-content-muted dark:text-content-dark-muted">
                                        Actualizado: {lastRefresh.toLocaleTimeString()}
                                    </span>
                                )}
                                <Button
                                    onClick={autoRefreshRates}
                                    disabled={refreshing}
                                    className="bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black shadow-none"
                                >
                                    {refreshing ? "⟳ Consultando..." : "⟳ Auto-actualizar tasas"}
                                </Button>
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
                                            <span className={`text-[11px] font-black ${c.active ? "text-success" : "text-danger"}`}>
                                                {c.active ? "● Activa" : "○ Inactiva"}
                                            </span>
                                        </td>
                                        <td>
                                            {!c.is_base && (
                                                <button
                                                    onClick={() => api.currencies.toggle(c.id).then(load).catch(e => notify(e.message, "err"))}
                                                    className={`text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border transition-all ${c.active
                                                        ? "text-danger border-danger/30 bg-danger/5 hover:bg-danger hover:text-white"
                                                        : "text-success border-success/30 bg-success/5 hover:bg-success hover:text-black"
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

                    <div className="card-md p-4">
                        <div className="text-[11px] font-black text-warning uppercase tracking-wide mb-3">+ Agregar Moneda</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(4,1fr)_auto] gap-3 items-end">
                            {[
                                ["Código (ej. EUR)", "code"],
                                ["Nombre", "name"],
                                ["Símbolo", "symbol"],
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
                            <Button variant="primary" onClick={addCurrency}>Agregar</Button>
                        </div>
                    </div>
                </div>
            )}
        </Page>
    );
}

// ── Editor inline de tipo de cambio ──────────────────────────
function RateEditor({ currency, onSave }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(currency.exchange_rate);

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
                className="input w-28 h-8 text-xs"
            />
            <button
                onClick={() => { onSave(currency.id, val); setEditing(false); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-success/10 text-success hover:bg-success hover:text-black transition-all"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            </button>
            <button
                onClick={() => setEditing(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-3 text-content-muted hover:bg-danger/10 hover:text-danger transition-all"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
    );
}
