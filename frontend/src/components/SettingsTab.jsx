import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import Page from "./ui/Page";
import { Button } from "./ui/Button";
import Segmented from "./ui/Segmented";
import StatusMark from "./ui/StatusMark";
import { RowIcon } from "./ui/Ledger";
import { resolveImageUrl } from "../helpers";
import { applyBrandColor, clearBrandColor, DEFAULT_BRAND } from "../helpers/brandColor";
import { useApp } from "../context/AppContext";
import StorefrontSettings from "./Settings/StorefrontSettings";

// El respaldo es de la base entera, no de una empresa: solo el superusuario. El backend
// lo exige igual (ver routes/backup.js); esto es para no ofrecer una pestaña que va a
// responder 403.
const SECTIONS = [
    ["empresa", "Empresa"],
    ["suscripcion", "Mi suscripción"],
    ["factura", "Factura"],
    // Contenido del catálogo público: banners, anuncio y menú destacado. Va aquí y no en el
    // módulo Catálogo porque es configuración de la tienda, no gestión de productos.
    ["vitrina", "Vitrina"],
    ["respaldo", "Respaldo", { superuserOnly: true }],
];

// [clave, rótulo, tipo, ejemplo, opcional]. Lo opcional se dice a la derecha del rótulo y no
// dentro de él: "Slogan (opcional)" competía con el nombre del campo.
const FIELDS_IDENTIDAD = [
    ["store_name", "Nombre o razón social", "text", "Ej: Distribuidora El Sol C.A."],
    ["store_rif", "RIF", "text", "Ej: J-12345678-9"],
    ["store_slogan", "Slogan", "text", "Ej: Calidad garantizada", true],
];
const FIELDS_CONTACTO = [
    ["store_address", "Dirección fiscal", "text", "Av. Principal, Local 1"],
    ["store_city", "Ciudad y estado", "text", "Caracas, Miranda"],
    ["store_phone", "Teléfono", "tel", "0212-555-0000"],
    ["store_phone2", "Teléfono 2", "tel", "", true],
    ["store_email", "Correo electrónico", "email", "contacto@mitienda.com", true],
    ["store_website", "Sitio web", "text", "www.mitienda.com", true],
];

const FIELDS_FACTURA = [
    // Cómo se llama el papel que se entrega al cliente. Va primero porque es lo que el cliente
    // lee: mientras el sistema no esté homologado ante el SENIAT lo que emite no es una
    // factura fiscal, y decir que lo es en el documento es afirmar algo que no corresponde.
    // El día de la homologación se cambia acá y queda parejo en el ticket y en el carta.
    ["sales_doc_name", "Nombre del documento de venta", "text", "Documento de Venta"],
    ["tax_name", "Nombre del impuesto", "text", "Ej: IVA"],
    ["tax_rate", "Tasa de impuesto (%)", "number", "16"],
    ["receipt_footer", "Mensaje al pie del ticket", "text", "¡Gracias por su compra!"],
];

const SECTION = "bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

// Lo que se compara para saber si hay cambios sin guardar. El logo queda fuera: se sube y se
// guarda en el acto, no espera al botón.
const snap = (s) => {
    const { logo_url, logo_filename, ...rest } = s || {};
    return JSON.stringify(rest);
};

export default function SettingsTab({ notify }) {
    // La tasa vive en Monedas, su propio módulo; acá solo se necesita el símbolo de la
    // moneda base para el tope de exoneración, que ya trae el contexto global.
    const { loadSettings, employee, baseCurrency } = useApp();
    const [settings, setSettings] = useState({});
    const [saved, setSaved] = useState(snap({}));
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
            setSaved(snap(sRes.data));
            if (sRes.company) setCompanyInfo(sRes.company);
        } catch (e) { notify(e.message, "err"); }
    };

    useEffect(() => { load(); }, []);

    const saveSettings = async () => {
        setLoading(true);
        try {
            const { logo_url, logo_filename, ...rest } = settings;
            await api.settings.update(rest);
            setSaved(snap(settings));
            loadSettings();
            notify("Configuración guardada correctamente");
        } catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    };

    // Empresa y Factura comparten un mismo guardado: el aviso dice si quedó algo pendiente
    // aunque se haya cambiado de pestaña entre medio.
    const dirty = snap(settings) !== saved;

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

    const set = (key) => (e) => setSettings(p => ({ ...p, [key]: e.target.value }));
    const campo = ([key, label, type, placeholder, opcional], className = "") => (
        <Campo key={key} label={label} hint={opcional ? "Opcional" : null} className={className}>
            <input type={type} placeholder={placeholder} value={settings[key] || ""} onChange={set(key)} className={INPUT} />
        </Campo>
    );

    // Barra de guardado, pegada abajo mientras se desplaza: antes el botón quedaba al final
    // del formulario, a un lado, y no había forma de saber si algo quedó sin guardar.
    const barraGuardar = (
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 px-4 py-3 bg-white/90 dark:bg-surface-dark-2/90 backdrop-blur border-t border-border/60 dark:border-white/[0.06] flex items-center justify-end gap-3">
            {dirty ? (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-amber-700 dark:text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Cambios sin guardar
                </span>
            ) : (
                <span className="text-[13px] text-content-subtle">Todo guardado</span>
            )}
            <Button onClick={saveSettings} loading={loading} disabled={!dirty}>
                Guardar cambios
            </Button>
        </div>
    );

    const subheader = (
        <div className="flex gap-1 px-4 border-b border-border/20 dark:border-white/5 overflow-x-auto no-scrollbar">
            {visibleSections.map(([key, label]) => (
                <button
                    key={key}
                    onClick={() => setSection(key)}
                    className={`shrink-0 text-[13px] font-semibold border-b-2 px-3 py-2.5 transition-all ${section === key
                        ? "border-brand-500 text-brand-700 dark:text-brand-300"
                        : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                        }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );

    const headerOn = (settings.receipt_show_header || "true") === "true";
    const usados   = companyInfo?.current_users || 0;
    const maximo   = companyInfo?.max_users;
    const estado   = companyInfo?.subscription_status || "Demo";
    const ESTADO_MAP = {
        Activa:    { label: "Activa",    tone: "success", quiet: "check" },
        Ilimitado: { label: "Ilimitada", tone: "success", quiet: "check" },
        Demo:      { label: "Demo",      tone: "warning" },
    };

    return (
        <Page module="Sistema" title="Configuración general" subheader={subheader}>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-4">

                {/* ── Empresa ── */}
                {section === "empresa" && (
                    <div className="max-w-6xl">
                        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
                            <div className="space-y-4 min-w-0">
                                <Seccion titulo="Identidad legal" detalle="Sale en el encabezado de tickets, facturas y del catálogo público.">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {campo(FIELDS_IDENTIDAD[0], "md:col-span-2")}
                                        {campo(FIELDS_IDENTIDAD[1])}
                                        {campo(FIELDS_IDENTIDAD[2])}
                                    </div>
                                </Seccion>

                                <Seccion titulo="Contacto y ubicación" detalle="La dirección fiscal y los teléfonos que ven tus clientes.">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {campo(FIELDS_CONTACTO[0], "md:col-span-2")}
                                        {FIELDS_CONTACTO.slice(1).map(f => campo(f))}
                                    </div>
                                </Seccion>
                            </div>

                            <div className="space-y-4 min-w-0">
                                {/* Logo */}
                                <Seccion titulo="Logotipo" detalle="PNG, JPG o WebP, hasta 2 MB. Se guarda al elegirlo.">
                                    <label className="cursor-pointer group block">
                                        <div className="w-full h-28 bg-surface-2 dark:bg-white/[0.04] border border-dashed border-border dark:border-white/15 rounded-xl flex flex-col items-center justify-center overflow-hidden group-hover:border-content-subtle/60 transition-colors">
                                            {settings.logo_url
                                                ? <img src={resolveImageUrl(settings.logo_url)} alt="Logotipo" className="max-w-full max-h-full object-contain p-3" />
                                                : <div className="text-center text-content-subtle">
                                                    <svg className="w-6 h-6 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                    <div className="text-[13px] font-medium">Subir imagen</div>
                                                </div>
                                            }
                                        </div>
                                        <input type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
                                        {settings.logo_url && (
                                            <span className="mt-2 block text-center text-[12px] font-medium text-content-subtle group-hover:text-content dark:group-hover:text-white transition-colors">
                                                Cambiar logotipo
                                            </span>
                                        )}
                                    </label>
                                </Seccion>

                                {/* Color de marca */}
                                <Seccion titulo="Color de la marca" detalle="Se aplica a todo el sistema y al catálogo público.">
                                    <div className="flex items-center gap-2.5">
                                        <label className="relative shrink-0 cursor-pointer" title="Elegir color">
                                            <span
                                                className="block w-10 h-10 rounded-lg border border-black/10 dark:border-white/15"
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
                                            className={`${INPUT} flex-1 tabular-nums uppercase`}
                                        />
                                    </div>

                                    {/* Muestra en vivo: así se ven un botón y un enlace con este color. */}
                                    <div className="mt-3 flex items-center gap-3 rounded-lg bg-surface-2 dark:bg-white/[0.03] p-2.5">
                                        <span className="btn-accent flex-1 h-9 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center pointer-events-none">Botón</span>
                                        <span className="text-[13px] font-medium text-brand-600 dark:text-brand-400 underline underline-offset-2">Enlace</span>
                                    </div>

                                    {settings.brand_color && (
                                        <button
                                            type="button"
                                            onClick={() => previewBrand("")}
                                            className="mt-3 h-9 px-3 -ml-3 rounded-lg inline-flex items-center gap-1.5 text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.05] transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                            Volver al color original
                                        </button>
                                    )}

                                    <p className="mt-2 text-[12px] text-content-subtle leading-relaxed">
                                        Los tonos claros y oscuros se derivan solos. Si el color es muy claro se
                                        oscurece, para que el texto blanco de los botones siga leyéndose.
                                    </p>
                                </Seccion>

                                {/* Vista previa del encabezado del ticket. Imita el papel: centrado y
                                    con la dirección en mayúsculas, como sale impreso. */}
                                <Seccion titulo="Así sale en el ticket">
                                    <div className="bg-surface-2 dark:bg-black/30 rounded-xl p-4 text-center">
                                        <div className="flex flex-col items-center">
                                            {settings.logo_url ? (
                                                <img src={resolveImageUrl(settings.logo_url)} alt="" className="h-8 w-auto mb-2 object-contain" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full border border-dashed border-border mb-2" />
                                            )}
                                            <div className="text-[13px] font-semibold text-content dark:text-white leading-tight">{settings.store_name || "Mi tienda C.A."}</div>
                                            <div className="text-[12px] text-content-subtle tabular-nums">{settings.store_rif ? `RIF: ${settings.store_rif}` : "RIF: J-00000000-0"}</div>
                                            {settings.store_slogan && <div className="text-[11px] text-content-subtle italic mt-0.5">"{settings.store_slogan}"</div>}
                                            <div className="w-8 h-px bg-border dark:bg-white/15 my-2" />
                                            <div className="text-[11px] text-content-subtle uppercase leading-tight">{settings.store_address || "Calle Principal #1"}</div>
                                            <div className="text-[11px] text-content-subtle tabular-nums">{settings.store_phone || "0412-0000000"}</div>
                                        </div>
                                    </div>
                                </Seccion>
                            </div>
                        </div>
                        {barraGuardar}
                    </div>
                )}

                {/* ── Mi suscripción ── */}
                {section === "suscripcion" && (
                    <div className="max-w-2xl space-y-4">
                        <div className={`${SECTION} p-5`}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-[12px] text-content-subtle">Suscripción y licencia</p>
                                    <h2 className="text-[20px] font-semibold tracking-tight text-content dark:text-white truncate">{companyInfo?.name || "Mi empresa"}</h2>
                                    <p className="text-[13px] text-content-subtle tabular-nums">RIF {companyInfo?.tax_id || "sin registrar"}</p>
                                </div>
                                <StatusMark status={estado} map={{ ...ESTADO_MAP, [estado]: ESTADO_MAP[estado] || { label: estado, tone: "danger" } }} />
                            </div>

                            <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                                <div>
                                    <dt className="text-[12px] text-content-subtle">Plan</dt>
                                    <dd className="text-[15px] font-semibold text-content dark:text-white">{companyInfo?.plan_name || "Básico"}</dd>
                                </div>
                                <div>
                                    <dt className="text-[12px] text-content-subtle">Vence</dt>
                                    <dd className="text-[15px] font-semibold text-content dark:text-white tabular-nums">
                                        {companyInfo?.expires_at ? new Date(companyInfo.expires_at).toLocaleDateString("es-VE") : "Sin vencimiento"}
                                    </dd>
                                </div>
                                <div className="sm:col-span-2">
                                    <dt className="flex items-baseline justify-between gap-3">
                                        <span className="text-[12px] text-content-subtle">Usuarios</span>
                                        <span className="text-[13px] font-medium text-content dark:text-white tabular-nums">
                                            {maximo === 0 ? `${usados} · sin límite` : `${usados} de ${maximo || 5}`}
                                        </span>
                                    </dt>
                                    {maximo > 0 && (
                                        <dd className="mt-2 h-1.5 rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${usados >= maximo ? "bg-amber-500" : "bg-content-subtle/50"}`}
                                                style={{ width: `${Math.min(100, (usados / maximo) * 100)}%` }}
                                            />
                                        </dd>
                                    )}
                                </div>
                            </dl>
                        </div>

                        <p className="flex items-start gap-2.5 px-1 text-[13px] text-content-subtle leading-relaxed">
                            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Para renovar la licencia, extender la vigencia o sumar usuarios, contacta al administrador del sistema.
                        </p>
                    </div>
                )}

                {/* ── Factura ── */}
                {section === "factura" && (
                    <div className="max-w-2xl">
                        <div className="space-y-4">
                            <Seccion titulo="Documento y ticket" detalle="Cómo se llama y qué dice el papel que recibe el cliente.">
                                <div className="space-y-3">
                                    {FIELDS_FACTURA.map(([key, label, type, placeholder]) => (
                                        <Campo key={key} label={label}>
                                            {key === "receipt_footer" ? (
                                                <textarea
                                                    rows={2}
                                                    placeholder={placeholder}
                                                    value={settings[key] || ""}
                                                    onChange={set(key)}
                                                    className={`${INPUT} !h-auto py-2.5 resize-none`}
                                                />
                                            ) : (
                                                <input type={type} placeholder={placeholder} value={settings[key] || ""} onChange={set(key)} className={INPUT} />
                                            )}
                                        </Campo>
                                    ))}

                                    <Campo label="Ancho de la impresora térmica">
                                        <Segmented
                                            value={settings.printer_width || "80"}
                                            onChange={v => setSettings(p => ({ ...p, printer_width: v }))}
                                            options={[
                                                { key: "80", label: "80 mm · estándar" },
                                                { key: "58", label: "58 mm · compacta" },
                                            ]}
                                        />
                                    </Campo>
                                </div>

                                <div className="mt-4 rounded-xl border border-border/70 dark:border-white/[0.08]">
                                    <Interruptor
                                        titulo="Encabezado de la empresa en el ticket"
                                        detalle="Logo, nombre, RIF, dirección y teléfonos al inicio. Apágalo si imprimes en papel membretado."
                                        checked={headerOn}
                                        onChange={() => setSettings(p => ({ ...p, receipt_show_header: headerOn ? "false" : "true" }))}
                                    />
                                </div>
                            </Seccion>

                            <Seccion titulo="Crédito y cobranza">
                                <div className="space-y-4">
                                    {/* Tope de exoneración. Solo limita a quien tenga el permiso
                                        "Exonerar saldo por cobrar" sin ser administrador: el admin no
                                        tiene tope. */}
                                    <Campo label={`Tope para exonerar saldo (${baseCurrency?.symbol || "Ref."})`}
                                        ayuda="Monto máximo que puede perdonar por factura un usuario que no es administrador. Con 0 o vacío no hay límite.">
                                        <input type="number" step="0.01" min="0" placeholder="0 = sin límite"
                                            value={settings.forgive_limit || ""} onChange={set("forgive_limit")}
                                            className={`${INPUT} tabular-nums`} />
                                    </Campo>

                                    {/* Plazo general de crédito a clientes. La ficha de cada cliente
                                        puede tener su excepción; si está vacía, manda este. */}
                                    <Campo label="Plazo de crédito a clientes (días)"
                                        ayuda="Días que tiene cualquier cliente para pagar una factura a crédito antes de figurar como vencida en Cuentas por cobrar. Para darle otro plazo a un cliente, cárgalo en su ficha de Contactos.">
                                        <input type="text" inputMode="numeric" placeholder="0 = de contado"
                                            value={settings.customer_credit_days || ""}
                                            onChange={e => setSettings(p => ({ ...p, customer_credit_days: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                                            className={`${INPUT} tabular-nums`} />
                                    </Campo>
                                </div>
                            </Seccion>
                        </div>
                        {barraGuardar}
                    </div>
                )}

                {/* ── Vitrina ── */}
                {section === "vitrina" && <StorefrontSettings notify={notify} />}

                {/* ── Respaldo ── */}
                {section === "respaldo" && (
                    <div className="max-w-2xl space-y-4">
                        <div className={`${SECTION} p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4`}>
                            <div className="min-w-0">
                                <p className="text-[14px] font-semibold text-content dark:text-white">Respaldo automático</p>
                                <p className="mt-0.5 text-[13px] text-content-subtle leading-relaxed max-w-md">
                                    Se genera cada 24 horas en la carpeta <code className="px-1.5 py-0.5 rounded bg-surface-2 dark:bg-white/10 text-[12px] text-content dark:text-white">POSSYSTEM/backups/</code> y se conservan los últimos 7 días.
                                </p>
                            </div>
                            <Button onClick={triggerBackup} loading={triggering} className="shrink-0">
                                Respaldar ahora
                            </Button>
                        </div>

                        <div className={`${SECTION} overflow-hidden`}>
                            <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-border/60 dark:border-white/[0.06]">
                                <p className="text-[14px] font-semibold text-content dark:text-white">
                                    Respaldos disponibles
                                    {backups.length > 0 && <span className="ml-1.5 font-normal text-content-subtle">· {backups.length}</span>}
                                </p>
                                <button
                                    onClick={loadBackups}
                                    disabled={backupLoading}
                                    className="h-8 px-3 -mr-2 rounded-lg inline-flex items-center gap-1.5 text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                                >
                                    <svg className={`w-4 h-4 ${backupLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Actualizar
                                </button>
                            </div>

                            {backupLoading && backups.length === 0 ? (
                                <p className="px-5 py-10 text-center text-[13px] text-content-subtle">Cargando…</p>
                            ) : backups.length === 0 ? (
                                <div className="px-5 py-10 text-center">
                                    <p className="text-[14px] font-semibold text-content dark:text-white">Sin respaldos aún</p>
                                    <p className="text-[13px] text-content-subtle mt-1">El primero se genera al iniciar el servicio.</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-border/60 dark:divide-white/[0.06]">
                                    {backups.map((b, i) => (
                                        <li key={b.filename} className="pl-5 pr-3 py-3 flex items-center gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[13px] font-medium text-content dark:text-white truncate">{b.filename}</p>
                                                <p className="text-[12px] text-content-subtle tabular-nums">
                                                    {fmtDate(b.created_at)} · {fmtSize(b.size)}
                                                </p>
                                            </div>
                                            {i === 0 && <StatusMark status="ultimo" map={{ ultimo: { label: "Último", tone: "success", quiet: "check" } }} />}
                                            <a
                                                href={`${api.backup.download(b.filename)}`}
                                                download={b.filename}
                                                className="btn-outline h-8 px-3 rounded-lg text-[12px] font-medium inline-flex items-center shrink-0"
                                            >
                                                Descargar
                                            </a>
                                            <RowIcon icon="trash" tone="danger" title="Eliminar respaldo" onClick={() => deleteBackup(b.filename)} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </Page>
    );
}

// ── helpers ──────────────────────────────────────────────────────────────────

// Tarjeta de sección: título en caja de oración y una línea que explica para qué sirve.
function Seccion({ titulo, detalle, children }) {
    return (
        <section className={`${SECTION} p-5`}>
            <div className="mb-4">
                <h3 className="text-[14px] font-semibold text-content dark:text-white">{titulo}</h3>
                {detalle && <p className="text-[12px] text-content-subtle mt-0.5">{detalle}</p>}
            </div>
            {children}
        </section>
    );
}

// Rótulo arriba, "Opcional" a la derecha y, si hace falta, una ayuda debajo del campo.
function Campo({ label, hint, ayuda, className = "", children }) {
    return (
        <div className={`min-w-0 ${className}`}>
            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-medium text-content-subtle">{label}</span>
                {hint && <span className="text-[11px] text-content-subtle/70">{hint}</span>}
            </p>
            {children}
            {ayuda && <p className="mt-1.5 text-[12px] text-content-subtle leading-relaxed">{ayuda}</p>}
        </div>
    );
}

// Fila de interruptor: título, qué implica y el switch. La fila entera es la etiqueta.
function Interruptor({ titulo, detalle, checked, onChange }) {
    return (
        <label className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-surface-2/60 dark:hover:bg-white/[0.02] rounded-xl transition-colors">
            <span className="min-w-0">
                <span className="block text-[13px] font-medium text-content dark:text-white">{titulo}</span>
                <span className="block text-[12px] text-content-subtle mt-0.5 leading-snug">{detalle}</span>
            </span>
            <span className="relative inline-flex items-center shrink-0">
                <input type="checkbox" className="sr-only peer" checked={!!checked} onChange={onChange} />
                <span className="block w-10 h-6 rounded-full bg-border dark:bg-white/15 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-checked:bg-brand-600 dark:peer-checked:bg-brand-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
            </span>
        </label>
    );
}
