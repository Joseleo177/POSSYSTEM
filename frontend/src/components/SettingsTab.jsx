import { useState, useEffect } from "react";
import { api } from "../services/api";
import Page from "./ui/Page";
import { Button } from "./ui/Button";
import { resolveImageUrl } from "../helpers";

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
        <div className="flex gap-1 px-4 border-b border-border/20 dark:border-white/5">
            {SECTIONS.map(([key, label]) => (
                <button
                    key={key}
                    onClick={() => setSection(key)}
                    className={`text-[11px] font-black uppercase tracking-wide border-b-2 px-3 py-2.5 transition-all ${
                        section === key
                            ? "border-brand-500 text-brand-500"
                            : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );

    return (
        <Page module="MÓDULO DE SISTEMA" title="Configuración Global" subheader={subheader}>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-4">

                {/* ── Empresa ── */}
                {section === "empresa" && (
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="space-y-3">
                            <div className="bg-white dark:bg-surface-dark-3 rounded-xl p-4 border border-border/40 dark:border-white/10 shadow-sm">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-content dark:text-white">Identidad Legal de la Empresa</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {FIELDS_EMPRESA.slice(0, 3).map(([key, label, type, placeholder]) => (
                                        <div key={key} className={key === "store_name" ? "md:col-span-2" : ""}>
                                            <label className="label">{label}</label>
                                            <input
                                                type={type}
                                                placeholder={placeholder}
                                                value={settings[key] || ""}
                                                onChange={e => setSettings(p => ({ ...p, [key]: e.target.value }))}
                                                className="input h-9"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white dark:bg-surface-dark-3 rounded-xl p-4 border border-border/40 dark:border-white/10 shadow-sm">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-lg bg-info/10 text-info flex items-center justify-center">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-content dark:text-white">Contacto y Ubicación Fiscal</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {FIELDS_EMPRESA.slice(3).map(([key, label, type, placeholder]) => (
                                        <div key={key} className={key === "store_address" ? "md:col-span-2" : ""}>
                                            <label className="label">{label}</label>
                                            <input
                                                type={type}
                                                placeholder={placeholder}
                                                value={settings[key] || ""}
                                                onChange={e => setSettings(p => ({ ...p, [key]: e.target.value }))}
                                                className="input h-9"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button onClick={saveSettings} disabled={loading} className="h-8 px-6 text-[10px]">
                                    {loading ? "Guardando..." : "Guardar Cambios"}
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {/* Logo */}
                            <div className="bg-white dark:bg-surface-dark-3 rounded-xl p-4 border border-border/40 dark:border-white/10 shadow-sm">
                                <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-3 block opacity-60">Logotipo</span>
                                <label className="cursor-pointer group block">
                                    <div className="w-full h-28 bg-surface-2 dark:bg-white/5 border-2 border-dashed border-border/40 dark:border-white/10 rounded-xl flex flex-col items-center justify-center overflow-hidden mb-2 group-hover:border-brand-500/50 transition-all duration-300 group-hover:bg-brand-500/[0.02]">
                                        {settings.logo_url
                                            ? <img src={resolveImageUrl(settings.logo_url)} alt="logo" className="max-w-full max-h-full object-contain p-3 transition-transform group-hover:scale-105" />
                                            : <div className="text-center">
                                                <div className="w-9 h-9 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center mx-auto mb-1.5 group-hover:bg-brand-500 group-hover:text-black transition-all">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                </div>
                                                <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest">Subir Imagen</div>
                                            </div>
                                        }
                                    </div>
                                    <input type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
                                </label>
                                <p className="text-[9px] font-bold text-center text-content-subtle dark:text-white/20 uppercase tracking-widest">PNG, JPG o WebP · Max 2MB</p>
                            </div>

                            {/* Preview */}
                            <div className="bg-white dark:bg-surface-dark-3 rounded-xl p-4 border border-border/40 dark:border-white/10 shadow-sm">
                                <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-3 block opacity-60">Vista previa de ticket</span>
                                <div className="bg-surface-2 dark:bg-[#151515] rounded-xl p-4 text-center border border-border/20 dark:border-white/5 shadow-inner">
                                    <div className="flex flex-col items-center">
                                        {settings.logo_url ? (
                                            <img src={resolveImageUrl(settings.logo_url)} alt="logo" className="h-8 w-auto mb-2 object-contain" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full border border-dashed border-border/40 mb-2 flex items-center justify-center text-[9px] text-content-subtle opacity-30">NO LOGO</div>
                                        )}
                                        <div className="text-xs font-black text-content dark:text-white uppercase tracking-tight leading-none mb-0.5">{settings.store_name || "MI TIENDA E.C.A"}</div>
                                        <div className="text-[9px] font-bold text-content-subtle uppercase tracking-widest opacity-60">{settings.store_rif ? `RIF: ${settings.store_rif}` : "RIF: J-00000000-0"}</div>
                                        {settings.store_slogan && <div className="text-[9px] text-content-subtle italic mt-0.5 font-medium">"{settings.store_slogan}"</div>}
                                        <div className="w-6 h-px bg-border/20 my-1.5" />
                                        <div className="text-[9px] font-bold text-content-subtle uppercase tracking-tight leading-tight">{settings.store_address || "Calle Principal #1"}</div>
                                        <div className="text-[9px] font-bold text-content-subtle uppercase tracking-tight tabular-nums">{settings.store_phone || "0412-0000000"}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Factura ── */}
                {section === "factura" && (
                    <div className="max-w-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-white dark:bg-surface-dark-3 rounded-xl p-4 border border-border/40 dark:border-white/10 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-content dark:text-white">Parámetros de Facturación</span>
                            </div>
                            <div className="space-y-3 mb-4">
                                {FIELDS_FACTURA.map(([key, label, type, placeholder]) => (
                                    <div key={key}>
                                        <label className="label">{label}</label>
                                        {key === "receipt_footer" ? (
                                            <textarea
                                                rows={3}
                                                placeholder={placeholder}
                                                value={settings[key] || ""}
                                                onChange={e => setSettings(p => ({ ...p, [key]: e.target.value }))}
                                                className="input min-h-[80px] p-3 resize-none"
                                            />
                                        ) : (
                                            <input
                                                type={type}
                                                placeholder={placeholder}
                                                value={settings[key] || ""}
                                                onChange={e => setSettings(p => ({ ...p, [key]: e.target.value }))}
                                                className="input h-9"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-end border-t border-border/10 pt-3">
                                <Button onClick={saveSettings} disabled={loading} className="h-8 px-6 text-[10px]">
                                    {loading ? "Guardando..." : "Guardar Configuración"}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Monedas ── */}
                {section === "currencies" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3">
                        {base && (
                            <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </div>
                                <div>
                                    <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-0.5">Moneda Base</div>
                                    <div className="text-[11px] font-black text-content dark:text-white uppercase">{base.name} ({base.symbol} {base.code})</div>
                                    <div className="text-[9px] font-bold text-content-subtle opacity-60 uppercase tracking-widest">Tipo de cambio fijo en 1.0 · Base de todos los movimientos</div>
                                </div>
                            </div>
                        )}

                        <div className="bg-white dark:bg-surface-dark-3 rounded-xl border border-border/40 dark:border-white/10 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 flex items-center justify-between border-b border-border/10">
                                <span className="text-[10px] font-black uppercase tracking-widest text-content dark:text-white">Tipos de Cambio</span>
                                <div className="flex items-center gap-2">
                                    {lastRefresh && (
                                        <span className="text-[9px] font-black text-content-subtle uppercase tracking-widest opacity-40">Sync: {lastRefresh.toLocaleTimeString()}</span>
                                    )}
                                    <button
                                        onClick={autoRefreshRates}
                                        disabled={refreshing}
                                        className={`h-7 px-3 rounded-lg bg-info/10 text-info text-[10px] font-black uppercase tracking-widest border border-info/20 hover:bg-info hover:text-black transition-all ${refreshing ? "animate-pulse" : ""}`}
                                    >
                                        {refreshing ? "Sincronizando..." : "Sincronizar Online"}
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-surface-2 dark:bg-white/[0.02]">
                                            {["Código", "Nombre", "Símbolo", "Tasa (1 USD =)", "Estado", ""].map(h => (
                                                <th key={h} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-content-subtle opacity-40">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/10 text-[11px]">
                                        {currencies.map((c) => (
                                            <tr key={c.id} className="hover:bg-brand-500/[0.02] transition-colors">
                                                <td className="px-4 py-2 font-black text-brand-500">{c.code}</td>
                                                <td className="px-4 py-2 font-bold text-content dark:text-white uppercase truncate">{c.name}</td>
                                                <td className="px-4 py-2 font-black text-content-subtle">{c.symbol}</td>
                                                <td className="px-4 py-2">
                                                    {c.is_base ? (
                                                        <span className="text-content-subtle opacity-40 font-black tracking-widest italic">1.000 (Base)</span>
                                                    ) : (
                                                        <RateEditor currency={c} onSave={updateRate} />
                                                    )}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${c.active ? "bg-success/10 text-success border-success/30" : "bg-danger/10 text-danger border-danger/30"}`}>
                                                        {c.active ? "Activa" : "Inactiva"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2">
                                                    {!c.is_base && (
                                                        <button
                                                            onClick={() => api.currencies.toggle(c.id).then(load).catch(e => notify(e.message, "err"))}
                                                            className={`h-6 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all ${c.active ? "bg-danger/10 text-danger border-danger/20 hover:bg-danger hover:text-white" : "bg-success/10 text-success border-success/20 hover:bg-success hover:text-black"}`}
                                                        >
                                                            {c.active ? "Suspender" : "Habilitar"}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Nueva Moneda */}
                        <div className="bg-white dark:bg-surface-dark-3 rounded-xl p-4 border border-border/40 dark:border-white/10 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-content dark:text-white">Registrar Nueva Divisa</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                                {[
                                    ["Código ISO (EUR)", "code", "text"],
                                    ["Nombre", "name", "text"],
                                    ["Símbolo", "symbol", "text"],
                                    ["Tasa vs USD", "exchange_rate", "number"],
                                ].map(([label, key, type]) => (
                                    <div key={key}>
                                        <label className="label">{label}</label>
                                        <input
                                            value={newCurrency[key]}
                                            onChange={e => setNewCurrency(p => ({ ...p, [key]: e.target.value }))}
                                            type={type}
                                            className="input h-9 w-full"
                                        />
                                    </div>
                                ))}
                                <button
                                    onClick={addCurrency}
                                    className="h-9 px-5 bg-warning text-black font-black uppercase text-[10px] tracking-widest rounded-xl hover:shadow-lg hover:shadow-warning/20 transition-all active:scale-95"
                                >
                                    Agregar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
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
                className="w-24 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/5 rounded-lg px-2 h-7 text-[11px] font-bold text-content dark:text-white outline-none focus:border-brand-500"
            />
            <button
                onClick={() => { onSave(currency.id, val); setEditing(false); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-black transition-all"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>
            </button>
            <button
                onClick={() => setEditing(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-3 text-content-muted hover:bg-danger/10 hover:text-danger transition-all opacity-40 hover:opacity-100"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
    );
}
