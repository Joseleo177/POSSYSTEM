import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import Page from "./ui/Page";
import { Button } from "./ui/Button";
import { resolveImageUrl } from "../helpers";
import { applyBrandColor, clearBrandColor, DEFAULT_BRAND } from "../helpers/brandColor";
import { useApp } from "../context/AppContext";
import StorefrontSettings from "./Settings/StorefrontSettings";

// El respaldo es de la base entera, no de una empresa: solo el superusuario. El backend
// lo exige igual (ver routes/backup.js); esto es para no ofrecer una pestaña que va a
// responder 403.
const SECTIONS = [
    ["empresa", "Empresa"],
    ["suscripcion", "Mi Suscripción"],
    ["factura", "Factura"],
    // Contenido del catálogo público: banners, anuncio y menú destacado. Va aquí y no en el
    // módulo Catálogo porque es configuración de la tienda, no gestión de productos.
    ["vitrina", "Vitrina"],
    ["respaldo", "Respaldo", { superuserOnly: true }],
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
    // Cómo se llama el papel que se entrega al cliente. Va primero porque es lo que el cliente
    // lee: mientras el sistema no esté homologado ante el SENIAT lo que emite no es una
    // factura fiscal, y decir que lo es en el documento es afirmar algo que no corresponde.
    // El día de la homologación se cambia acá y queda parejo en el ticket y en el carta.
    ["sales_doc_name", "Nombre del documento de venta", "text", "Documento de Venta"],
    ["tax_name", "Nombre del impuesto", "text", "Ej: IVA"],
    ["tax_rate", "Tasa de impuesto (%)", "number", "16"],
    ["receipt_footer", "Mensaje pie de factura", "text", "¡Gracias por su compra!"],
];

export default function SettingsTab({ notify }) {
    // La tasa vive en Monedas, su propio módulo; acá solo se necesita el símbolo de la
    // moneda base para el tope de exoneración, que ya trae el contexto global.
    const { loadSettings, employee, baseCurrency } = useApp();
    const [settings, setSettings] = useState({});
    const [companyInfo, setCompanyInfo] = useState(null);
    // Vitrina es el extra del catálogo público: no viene incluido para todas las empresas,
    // lo enciende el superusuario por empresa (ver CompanyModal). Mientras no se sepa si
    // esta empresa lo tiene, la pestaña se queda oculta — mostrarla y ocultarla al llegar
    // la respuesta se ve peor que un instante sin ella.
    const visibleSections = SECTIONS.filter(([key, , opts]) => {
        if (opts?.superuserOnly) return !!employee?.is_superuser;
        if (key === "vitrina") return !!companyInfo?.catalog_enabled;
        return true;
    });
    const [loading, setLoading] = useState(false);
    const [section, setSection] = useState("empresa");

    const load = async () => {
        try {
            const sRes = await api.settings.getAll();
            setSettings(sRes.data);
            if (sRes.company) setCompanyInfo(sRes.company);
        } catch (e) { notify(e.message, "err"); }
    };

    useEffect(() => { load(); }, []);

    const saveSettings = async () => {
        setLoading(true);
        try {
            const { logo_url, logo_filename, ...rest } = settings;
            await api.settings.update(rest);
            loadSettings();
            notify("Configuración guardada correctamente");
        } catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    };

    // El color se pinta en el sistema mientras se elige: la vista previa real es la interfaz
    // entera, no un cuadrito. Si se sale sin guardar, al recargar vuelve el color guardado.
    const previewBrand = (hex) => {
        setSettings(p => ({ ...p, brand_color: hex }));
        if (hex) applyBrandColor(hex); else clearBrandColor();
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

    // ── Backup ─────────────────────────────────────────────────
    const [backups, setBackups] = useState([]);
    const [backupLoading, setBackupLoading] = useState(false);
    const [triggering, setTriggering] = useState(false);

    const loadBackups = useCallback(async () => {
        setBackupLoading(true);
        try {
            const r = await api.backup.list();
            setBackups(r.data || []);
        } catch { } finally { setBackupLoading(false); }
    }, []);

    useEffect(() => { if (section === "respaldo") loadBackups(); }, [section]);

    const triggerBackup = async () => {
        setTriggering(true);
        try {
            await api.backup.trigger();
            notify("Respaldo iniciado. Actualiza la lista en unos segundos.");
            setTimeout(loadBackups, 5000);
        } catch (e) { notify(e.message, "err"); }
        finally { setTriggering(false); }
    };

    const deleteBackup = async (filename) => {
        try {
            await api.backup.remove(filename);
            notify("Respaldo eliminado");
            loadBackups();
        } catch (e) { notify(e.message, "err"); }
    };

    const fmtSize = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const fmtDate = (d) => new Date(d).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });

    const subheader = (
        <div className="flex gap-1 px-4 border-b border-border/20 dark:border-white/5">
            {visibleSections.map(([key, label]) => (
                <button
                    key={key}
                    onClick={() => setSection(key)}
                    className={`text-[11px] font-black uppercase tracking-wide border-b-2 px-3 py-2.5 transition-all ${section === key
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

                            {/* Color de marca */}
                            <div className="bg-white dark:bg-surface-dark-3 rounded-xl p-4 border border-border/40 dark:border-white/10 shadow-sm">
                                <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-3 block opacity-60">Color de la marca</span>

                                <div className="flex items-center gap-2.5 mb-3">
                                    <label className="relative shrink-0 cursor-pointer" title="Elegir color">
                                        <span
                                            className="block w-11 h-11 rounded-xl border border-border/40 dark:border-white/10 shadow-inner"
                                            style={{ backgroundColor: settings.brand_color || DEFAULT_BRAND }}
                                        />
                                        <input
                                            type="color"
                                            value={settings.brand_color || DEFAULT_BRAND}
                                            onChange={e => previewBrand(e.target.value)}
                                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                        />
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.brand_color || ""}
                                        placeholder={DEFAULT_BRAND}
                                        onChange={e => {
                                            const v = e.target.value.trim();
                                            // Se escribe siempre para no bloquear el tecleo, pero solo se pinta
                                            // cuando el hex ya está completo.
                                            setSettings(p => ({ ...p, brand_color: v }));
                                            if (/^#?[0-9a-fA-F]{6}$/.test(v)) applyBrandColor(v);
                                        }}
                                        className="input h-9 flex-1 font-mono uppercase"
                                    />
                                </div>

                                <div className="flex items-center gap-2 mb-3">
                                    <button type="button" className="btn-md btn-primary flex-1 text-[10px] h-8 pointer-events-none">BOTÓN</button>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-500">Texto</span>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => previewBrand("")}
                                    className="text-[9px] font-black uppercase tracking-widest text-content-subtle hover:text-brand-500 transition-colors"
                                >
                                    Restaurar color por defecto
                                </button>

                                <p className="text-[9px] font-bold text-content-subtle dark:text-white/20 mt-2 leading-relaxed">
                                    Se aplica a todo el sistema y al catálogo público. Los tonos claros y oscuros
                                    se derivan solos; si el color es muy claro se oscurece para que el texto blanco
                                    de los botones siga leyéndose.
                                </p>
                            </div>

                            {/* Preview */}
                            <div className="bg-white dark:bg-surface-dark-3 rounded-xl p-4 border border-border/40 dark:border-white/10 shadow-sm">
                                <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-3 block opacity-60">Vista previa de ticket</span>
                                <div className="bg-surface-2 dark:bg-[#151515] rounded-xl p-4 text-center border border-border/20 dark:border-white/5 shadow-inner">
                                    <div className="flex flex-col items-center">
                                        {settings.logo_url ? (
                                            <img src={resolveImageUrl(settings.logo_url)} alt="logo" className="h-8 w-auto mb-2 object-contain" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full border border-dashed border-border/40 mb-2 flex items-center justify-center text-[9px] text-content-subtle">NO LOGO</div>
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

                {/* ── Mi Suscripción ── */}
                {section === "suscripcion" && (
                    <div className="max-w-2xl mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-white dark:bg-surface-dark-3 rounded-2xl p-6 border border-border/40 dark:border-white/10 shadow-sm space-y-5">
                            <div className="flex items-center justify-between border-b border-border/20 dark:border-white/10 pb-4">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-brand-500">Suscripción y Licencia Actual</div>
                                    <h2 className="text-base font-black text-content dark:text-white uppercase mt-0.5">{companyInfo?.name || "Mi Empresa"}</h2>
                                    <span className="text-[10px] text-content-subtle font-mono">RIF: {companyInfo?.tax_id || "N/A"}</span>
                                </div>
                                <span className={`px-3 py-1 text-xs font-black rounded-full border ${
                                    companyInfo?.subscription_status === 'Activa' || companyInfo?.subscription_status === 'Ilimitado'
                                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                        : companyInfo?.subscription_status === 'Demo'
                                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                                        : 'bg-red-500/10 text-red-500 border-red-500/30'
                                }`}>
                                    {companyInfo?.subscription_status || "Demo"}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-4 bg-surface-2/60 dark:bg-white/[0.02] rounded-xl border border-border/30 dark:border-white/5 space-y-1">
                                    <span className="text-[9px] font-black uppercase text-content-subtle block">Plan de Suscripción</span>
                                    <span className="text-lg font-black text-brand-500 uppercase">{companyInfo?.plan_name || "Básico"}</span>
                                </div>

                                <div className="p-4 bg-surface-2/60 dark:bg-white/[0.02] rounded-xl border border-border/30 dark:border-white/5 space-y-1">
                                    <span className="text-[9px] font-black uppercase text-content-subtle block">Vencimiento de Licencia</span>
                                    <span className="text-sm font-black text-content dark:text-white">
                                        {companyInfo?.expires_at ? new Date(companyInfo.expires_at).toLocaleDateString() : "Vigencia Ilimitada"}
                                    </span>
                                </div>
                            </div>

                            {/* Usuarios Permitidos */}
                            <div className="p-4 bg-surface-2/60 dark:bg-white/[0.02] rounded-xl border border-border/30 dark:border-white/5 space-y-2">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase">
                                    <span className="text-content-subtle">Usuarios de la Empresa</span>
                                    <span className="text-content dark:text-white font-mono font-bold">
                                        {companyInfo?.current_users || 0} / {companyInfo?.max_users === 0 ? "Ilimitados" : `${companyInfo?.max_users || 5} Máximo`}
                                    </span>
                                </div>
                                {companyInfo?.max_users > 0 && (
                                    <div className="w-full bg-border/30 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                                        <div 
                                            className="bg-brand-500 h-full rounded-full transition-all duration-500" 
                                            style={{ width: `${Math.min(100, ((companyInfo?.current_users || 0) / companyInfo.max_users) * 100)}%` }}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/20 flex items-center gap-3">
                                <svg className="w-5 h-5 text-brand-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <div className="text-[11px] text-content-subtle dark:text-white/70">
                                    Para renovar tu licencia, extender vigencia o aumentar el límite de usuarios, contacta al Administrador del Sistema.
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
                            {/* Tipo de impresora */}
                            <div className="mb-4">
                                <label className="label mb-1.5">Ancho de impresora térmica</label>
                                <div className="flex gap-2">
                                    {[["80", "80 mm", "Estándar"], ["58", "58 mm", "Compacta"]].map(([val, size, desc]) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setSettings(p => ({ ...p, printer_width: val }))}
                                            className={`flex-1 py-2.5 px-3 rounded-xl border text-left transition-all ${(settings.printer_width || "80") === val
                                                    ? "border-brand-500 bg-brand-500/10 text-brand-500"
                                                    : "border-border/30 dark:border-white/10 text-content-subtle dark:text-white/40 hover:border-brand-500/50"
                                                }`}
                                        >
                                            <div className="text-[12px] font-black">{size}</div>
                                            <div className="text-[10px] font-semibold opacity-70">{desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Encabezado de empresa en el ticket */}
                            <div className="mb-4">
                                <label className="label mb-1.5">Encabezado de empresa en el ticket</label>
                                <button
                                    type="button"
                                    onClick={() => setSettings(p => ({ ...p, receipt_show_header: (p.receipt_show_header || "true") === "true" ? "false" : "true" }))}
                                    className={`w-full py-2.5 px-3 rounded-xl border text-left transition-all flex items-center justify-between ${(settings.receipt_show_header || "true") === "true"
                                            ? "border-brand-500 bg-brand-500/10"
                                            : "border-border/30 dark:border-white/10"
                                        }`}
                                >
                                    <div>
                                        <div className={`text-[12px] font-black ${(settings.receipt_show_header || "true") === "true" ? "text-brand-500" : "text-content-subtle dark:text-white/40"}`}>
                                            {(settings.receipt_show_header || "true") === "true" ? "Imprimir encabezado" : "Sin encabezado"}
                                        </div>
                                        <div className="text-[10px] font-semibold opacity-70 text-content-subtle dark:text-white/40">
                                            Logo, nombre, RIF, dirección y teléfonos al inicio del ticket
                                        </div>
                                    </div>
                                    <div className={`w-9 h-5 rounded-full relative transition-all shrink-0 ${(settings.receipt_show_header || "true") === "true" ? "bg-brand-500" : "bg-surface-3 dark:bg-white/10"}`}>
                                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${(settings.receipt_show_header || "true") === "true" ? "left-[18px]" : "left-0.5"}`} />
                                    </div>
                                </button>
                            </div>

                            {/* Tope de exoneración. Solo limita a quien tenga el permiso "Exonerar
                                saldo por cobrar" sin ser administrador: el admin no tiene tope. */}
                            <div className="mb-4">
                                <label className="label mb-1.5">Tope para exonerar saldo ({baseCurrency?.symbol || "Ref."})</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0 = sin límite"
                                    value={settings.forgive_limit || ""}
                                    onChange={e => setSettings(p => ({ ...p, forgive_limit: e.target.value }))}
                                    className="input h-9"
                                />
                                <div className="text-[10px] font-semibold opacity-70 text-content-subtle dark:text-white/40 mt-1">
                                    Monto máximo que puede perdonar por factura un usuario no administrador. Con 0 o vacío no hay límite.
                                </div>
                            </div>

                            <div className="flex justify-end border-t border-border/10 pt-3">
                                <Button onClick={saveSettings} disabled={loading} className="h-8 px-6 text-[10px]">
                                    {loading ? "Guardando..." : "Guardar Configuración"}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Vitrina ── */}
                {section === "vitrina" && <StorefrontSettings notify={notify} />}

                {/* ── Respaldo ── */}
                {section === "respaldo" && (
                    <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3">

                        {/* Info + acción */}
                        <div className="bg-white dark:bg-surface-dark-3 rounded-xl p-4 border border-border/40 dark:border-white/10 shadow-sm">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 shrink-0 mt-0.5">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                                            <path d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z" />
                                            <path d="M9 12l2 2 4-4M8 4v4h8V4" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-black uppercase tracking-widest text-content dark:text-white mb-0.5">Respaldo Automático</div>
                                        <p className="text-[11px] text-content-subtle dark:text-white/40 leading-relaxed max-w-sm">
                                            Los respaldos se generan automáticamente cada 24 h y se guardan en la carpeta <code className="bg-surface-2 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono">POSSYSTEM/backups/</code>.
                                            Se conservan los últimos 7 días.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={triggerBackup}
                                    disabled={triggering}
                                    className="shrink-0 h-8 px-4 rounded-xl bg-brand-500 text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-50 transition-all active:scale-95"
                                >
                                    {triggering ? "Iniciando..." : "Hacer ahora"}
                                </button>
                            </div>
                        </div>

                        {/* Lista de respaldos */}
                        <div className="bg-white dark:bg-surface-dark-3 rounded-xl border border-border/40 dark:border-white/10 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 flex items-center justify-between border-b border-border/10">
                                <span className="text-[10px] font-black uppercase tracking-widest text-content dark:text-white">
                                    Respaldos disponibles
                                    {backups.length > 0 && <span className="ml-2 text-brand-500">({backups.length})</span>}
                                </span>
                                <button
                                    onClick={loadBackups}
                                    disabled={backupLoading}
                                    className="h-6 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide bg-surface-2 dark:bg-white/5 text-content-subtle dark:text-white/40 hover:text-brand-500 transition-all"
                                >
                                    {backupLoading ? "Cargando..." : "Actualizar"}
                                </button>
                            </div>

                            {backupLoading && backups.length === 0 ? (
                                <div className="px-4 py-8 text-center text-[11px] font-bold text-content-subtle dark:text-white/25">Cargando...</div>
                            ) : backups.length === 0 ? (
                                <div className="px-4 py-8 text-center">
                                    <div className="text-[11px] font-bold text-content-subtle dark:text-white/25">Sin respaldos aún</div>
                                    <div className="text-[10px] text-content-subtle/60 dark:text-white/15 mt-1">El primer respaldo se genera al iniciar el servicio</div>
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-surface-2 dark:bg-white/[0.02]">
                                            {["Archivo", "Fecha", "Tamaño", ""].map(h => (
                                                <th key={h} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-content-subtle">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/10 dark:divide-white/5">
                                        {backups.map((b, i) => (
                                            <tr key={b.filename} className={`hover:bg-brand-500/[0.02] transition-colors ${i === 0 ? "bg-success/[0.02]" : ""}`}>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        {i === 0 && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/20 uppercase tracking-widest shrink-0">Último</span>}
                                                        <span className="text-[11px] font-mono text-content dark:text-white/70 truncate max-w-[200px]">{b.filename}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-[11px] font-bold text-content-subtle dark:text-white/40 whitespace-nowrap">{fmtDate(b.created_at)}</td>
                                                <td className="px-4 py-2.5 text-[11px] font-bold text-content-subtle dark:text-white/40 tabular-nums whitespace-nowrap">{fmtSize(b.size)}</td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-1.5 justify-end">
                                                        <a
                                                            href={`${api.backup.download(b.filename)}`}
                                                            download={b.filename}
                                                            className="h-6 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide bg-brand-500/10 text-brand-500 border border-brand-500/20 hover:bg-brand-500 hover:text-black transition-all"
                                                        >
                                                            Descargar
                                                        </a>
                                                        <button
                                                            onClick={() => deleteBackup(b.filename)}
                                                            className="w-6 h-6 rounded-lg flex items-center justify-center bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </Page>
    );
}
