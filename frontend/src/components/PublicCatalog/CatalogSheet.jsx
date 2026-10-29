import { FIELD, FIELD_LABEL } from "./shared";

// Marco común de las hojas del catálogo público (Mis pedidos, detalle del pedido, finalizar
// pedido, reportar pago) y sus dos pieles.
//
// Las hojas son compartidas por los tres temas, pero no pueden verse igual en todos:
// - "erp": la del tema estándar, con los tokens del sistema (bg-surface, text-content...) y sus
//   variantes dark:, porque ese tema sí sigue el claro/oscuro del visitante.
// - "carta": la del tema de menú. La carta entera está en el color de panel que eligió la tienda
//   (Ajustes → Vitrina), y una hoja blanca del ERP encima se leía como "una ventana de otra app"
//   —"se ven demasiado genéricos" fue el reporte—. Aquí la hoja ES ese papel, con tinta fija
//   (neutral-XXX): text-content-subtle cambia con el modo oscuro del sistema y el panel no.
//
// Quien llama decide la piel pasando `panel` (el color) o no pasándolo; los componentes solo
// leen las clases de sheetSkin, no preguntan en qué tema están.

const ERP = {
    carta: false,
    sheet: "bg-surface dark:bg-surface-dark-2 border-t sm:border border-border/60 dark:border-white/10 sm:rounded-2xl",
    ink: "text-content dark:text-white",
    muted: "text-content-muted dark:text-white/75",
    subtle: "text-content-subtle",
    line: "border-border/60 dark:border-white/[0.06]",
    divide: "divide-border/60 dark:divide-white/[0.06]",
    card: "rounded-xl border border-border/70 dark:border-white/[0.08]",
    soft: "rounded-xl bg-surface-2 dark:bg-white/[0.04]",
    handle: "bg-border dark:bg-white/20",
    iconBtn: "rounded-lg text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.06]",
    iconTile: "rounded-full bg-surface-2 dark:bg-white/[0.06] text-content-muted dark:text-white/70",
    title: "text-[17px] font-semibold tracking-tight",
    section: "text-[14px] font-semibold text-content dark:text-white",
    field: FIELD,
    label: FIELD_LABEL,
    dashed: "rounded-xl border border-dashed border-border dark:border-white/15 text-content dark:text-white hover:bg-surface-2 dark:hover:bg-white/[0.04]",
    primary: "rounded-xl bg-brand-500 text-white text-[15px] font-semibold",
    secondary: "rounded-xl border border-border dark:border-white/15 text-[14px] font-medium text-content dark:text-white hover:bg-surface-2 dark:hover:bg-white/[0.05]",
    hover: "hover:bg-surface-2/70 dark:hover:bg-white/[0.03] active:bg-surface-2",
    selected: "border-brand-500 ring-2 ring-brand-500/20 bg-brand-500/[0.04]",
    option: "rounded-xl border border-border dark:border-white/10 hover:border-content-subtle/60 dark:hover:border-white/25",
    logoBox: "rounded-lg bg-surface-2 dark:bg-white/[0.06]",
};

const CARTA = {
    carta: true,
    sheet: "sm:rounded-[28px]",
    ink: "text-neutral-900",
    muted: "text-neutral-600",
    subtle: "text-neutral-500",
    line: "border-black/[0.07]",
    divide: "divide-black/[0.06]",
    card: "rounded-2xl bg-white/85 ring-1 ring-black/[0.05] shadow-[0_1px_3px_rgba(0,0,0,0.05)]",
    soft: "rounded-2xl bg-black/[0.04]",
    handle: "bg-black/15",
    iconBtn: "rounded-full bg-black/[0.05] text-neutral-600 hover:text-neutral-900 hover:bg-black/[0.09]",
    iconTile: "rounded-2xl bg-brand-500 text-brand-ink shadow-[0_6px_16px_-6px_rgb(var(--c-brand-600)/0.7)]",
    title: "font-display text-[21px] font-bold tracking-tight",
    section: "font-display text-[15px] font-semibold text-neutral-900",
    field: "w-full h-12 px-4 rounded-2xl border border-black/10 bg-white text-[16px] sm:text-[14px] text-neutral-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 placeholder:text-neutral-400 transition-shadow",
    label: "text-[12px] font-medium text-neutral-500",
    dashed: "rounded-2xl border-2 border-dashed border-black/10 text-neutral-800 hover:border-brand-500/50 hover:text-brand-600 hover:bg-white/60",
    primary: "rounded-full bg-brand-500 text-brand-ink text-[15px] font-semibold shadow-[0_10px_24px_-10px_rgb(var(--c-brand-600)/0.9)] hover:brightness-110",
    secondary: "rounded-full bg-black/[0.05] text-[14px] font-semibold text-neutral-800 hover:bg-black/[0.08]",
    hover: "hover:bg-white active:scale-[0.99]",
    selected: "bg-white ring-2 ring-brand-500 shadow-[0_8px_20px_-10px_rgb(var(--c-brand-600)/0.6)]",
    option: "bg-white/70 ring-1 ring-black/[0.06] hover:bg-white hover:ring-black/[0.12]",
    logoBox: "rounded-xl bg-white ring-1 ring-black/[0.06]",
};

export function sheetSkin(panel) {
    return panel ? { ...CARTA, style: { backgroundColor: panel } } : { ...ERP, style: undefined };
}

// Overlay + hoja. En el teléfono sube desde abajo con su asa; en escritorio es un diálogo
// centrado. `onClose` null bloquea el cierre al tocar fuera (mientras se envía algo).
// `overlay`: otro velo, p. ej. uno más claro cuando lo que hay detrás tiene que verse (la
// bienvenida sobre la carta).
export default function CatalogSheet({ skin, onClose, label, z = "z-50", width = "sm:max-w-lg", overlay = null, children }) {
    return (
        <div className={`fixed inset-0 ${z} flex items-end sm:items-center sm:justify-center sm:p-4`}>
            <div className={`absolute inset-0 ${overlay || `${skin.carta ? "bg-black/65" : "bg-black/50"} backdrop-blur-[3px]`} catalog-overlay-in`} onClick={onClose || undefined} />
            <div role="dialog" aria-modal="true" aria-label={label}
                className={`relative w-full ${width} max-h-[92vh] rounded-t-[28px] overflow-hidden shadow-2xl shadow-black/40 flex flex-col catalog-sheet-in ${skin.sheet}`}
                style={skin.style}>
                <div className="sm:hidden pt-2.5 flex justify-center shrink-0" aria-hidden="true">
                    <span className={`w-10 h-1 rounded-full ${skin.handle}`} />
                </div>
                {children}
            </div>
        </div>
    );
}

// Cabecera de hoja: icono, rótulo pequeño encima, título y subtítulo; a la derecha, acciones
// extra (actualizar, estado) y la X.
export function SheetHeader({ skin, icon, eyebrow, title, subtitle, actions, onClose, closeDisabled = false, border = false }) {
    return (
        <div className={`px-5 pt-3 sm:pt-5 pb-4 flex items-center justify-between gap-3 shrink-0 ${border ? `border-b ${skin.line}` : ""}`}>
            <div className="flex items-center gap-3 min-w-0">
                {icon && (
                    <div className={`w-11 h-11 shrink-0 flex items-center justify-center ${skin.iconTile}`}>{icon}</div>
                )}
                <div className="min-w-0">
                    {eyebrow && <p className={`text-[12px] ${skin.subtle} truncate`}>{eyebrow}</p>}
                    <h2 className={`${skin.title} ${skin.ink} leading-tight truncate`}>{title}</h2>
                    {subtitle && <p className={`text-[12px] ${skin.subtle} truncate tabular-nums mt-0.5`}>{subtitle}</p>}
                </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 -mr-1">
                {actions}
                {onClose && (
                    <button type="button" onClick={onClose} disabled={closeDisabled} aria-label="Cerrar" title="Cerrar"
                        className={`w-9 h-9 flex items-center justify-center transition-colors disabled:opacity-40 ${skin.iconBtn}`}>
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                )}
            </div>
        </div>
    );
}

// Progreso de un pedido en cuatro pasos. `compact`: la barra de la fila en "Mis pedidos";
// sin él, el paso a paso con nombres del detalle. Anulado y no procesado no avanzan: no se
// pinta ninguna barra, el estado ya lo dice en rojo o gris.
const PASOS = [
    { stage: "enviado", label: "Enviado" },
    { stage: "confirmado", label: "Confirmado" },
    { stage: "facturado", label: "Facturado" },
    { stage: "pagado", label: "Pagado" },
];

export function OrderProgress({ stage, skin, compact = false }) {
    const idx = PASOS.findIndex(p => p.stage === stage);
    if (idx < 0) return null;
    const hecho = idx === PASOS.length - 1;
    const color = hecho ? "bg-emerald-500" : "bg-brand-500";
    const vacio = skin.carta ? "bg-black/[0.08]" : "bg-border dark:bg-white/10";

    if (compact) {
        return (
            <div className="flex gap-1" aria-hidden="true">
                {PASOS.map((p, i) => (
                    <span key={p.stage} className={`h-1 flex-1 rounded-full ${i <= idx ? color : vacio}`} />
                ))}
            </div>
        );
    }

    return (
        <ol className="grid grid-cols-4" aria-label="Progreso del pedido">
            {PASOS.map((p, i) => {
                const listo = i <= idx;
                const actual = i === idx && !hecho;
                return (
                    <li key={p.stage} className="relative flex flex-col items-center text-center">
                        {i > 0 && (
                            <span className={`absolute top-[11px] right-1/2 w-full h-[3px] ${i <= idx ? color : vacio}`} aria-hidden="true" />
                        )}
                        <span className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center ${listo ? `${color} text-white` : `${vacio} ${skin.subtle}`} ${actual ? "ring-4 ring-brand-500/20" : ""}`}>
                            {listo && !actual ? (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            ) : (
                                <span className={`w-2 h-2 rounded-full ${actual ? "bg-white animate-pulse" : "bg-current opacity-40"}`} />
                            )}
                        </span>
                        <span className={`mt-1.5 text-[11px] leading-tight ${listo ? `font-semibold ${skin.ink}` : skin.subtle}`}>{p.label}</span>
                    </li>
                );
            })}
        </ol>
    );
}
