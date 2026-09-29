// Estado de un documento en un listado.
//
// El color es una señal, no un adorno: en un día normal casi todas las facturas están pagadas,
// y una pastilla verde en cada fila convertía el color en ruido de fondo — la pendiente se
// perdía entre cincuenta verdes. Aquí el estado "normal" (quiet) va en gris con un icono, y
// solo lo que pide atención lleva color y punto. `flag` además pinta el filete de la fila
// (ver .table-ledger en index.css) a través de `toneVar`.
//
// Los tonos de texto son un paso más oscuros que success/warning/danger del tema: esos
// tonos sobre blanco no llegan a 4.5:1 y el rótulo no se leía.
const TONES = {
    success: { text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", ring: "ring-emerald-500/20", toneVar: "#10b981" },
    warning: { text: "text-amber-700 dark:text-amber-400",     dot: "bg-amber-500",   ring: "ring-amber-500/20",   toneVar: "#f59e0b" },
    danger:  { text: "text-red-600 dark:text-red-400",         dot: "bg-red-500",     ring: "ring-red-500/20",     toneVar: "#ef4444" },
    violet:  { text: "text-violet-600 dark:text-violet-400",   dot: "bg-violet-500",  ring: "ring-violet-500/20",  toneVar: "#8b5cf6" },
    info:    { text: "text-sky-700 dark:text-sky-400",         dot: "bg-sky-500",     ring: "ring-sky-500/20",     toneVar: "#0ea5e9" },
    neutral: { text: "text-content-subtle",                    dot: "bg-content-subtle/60", ring: "ring-content-subtle/15", toneVar: "#9ca3af" },
};

// Femenino porque el documento es "la factura". Rojo solo para lo que exige cobrar: una
// cuenta en espera y un pedido del catálogo todavía no son deuda.
export const SALE_STATUS = {
    pagado:    { label: "Pagada",    tone: "success", quiet: "check" },
    anulado:   { label: "Anulada",   tone: "neutral", quiet: "void" },
    pendiente: { label: "Pendiente", tone: "danger",  flag: true },
    parcial:   { label: "Parcial",   tone: "warning", flag: true },
    // Saldada sin dinero: violeta para no confundirse con 'parcial' ni con 'devuelto'.
    exonerado: { label: "Exonerada", tone: "violet" },
    devuelto:  { label: "Devuelta",  tone: "warning" },
    borrador:  { label: "Borrador",  tone: "neutral" },
    espera:    { label: "En espera", tone: "info" },
    pedido:    { label: "Pedido",    tone: "violet" },
};

export const statusTone = (status, map = SALE_STATUS) => {
    const s = map[status];
    return s?.flag ? TONES[s.tone].toneVar : undefined;
};

const ICONS = {
    check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />,
    void:  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636L5.636 18.364M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
};

export default function StatusMark({ status, map = SALE_STATUS }) {
    // Sin mapear: neutro con el texto crudo. Un estado desconocido no es una alerta.
    const s = map[status] || { label: status || "—", tone: "neutral" };
    const t = TONES[s.tone] || TONES.neutral;

    if (s.quiet) {
        return (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-content-subtle whitespace-nowrap">
                <svg className={`w-3.5 h-3.5 shrink-0 ${s.quiet === "check" ? t.text : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {ICONS[s.quiet]}
                </svg>
                {s.label}
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center gap-2 text-[12px] font-semibold whitespace-nowrap ${t.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ring-4 ${t.dot} ${t.ring}`} />
            {s.label}
        </span>
    );
}
