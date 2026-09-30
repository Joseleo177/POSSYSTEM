import { toNameCase } from "../../helpers";

// Piezas comunes de las tablas .table-ledger (ver index.css): filas que abren su detalle,
// esqueleto de carga, estado vacío, rótulo de día y botones de icono.

// Props de una fila clicable. `open` es lo que hace la fila entera (casi siempre, ver el
// detalle); `tone` pinta el filete izquierdo cuando la fila pide atención (ver statusTone).
// Sin `open` la fila no es clicable y solo lleva el filete.
export const ledgerRow = (open, tone) => ({
    className: open ? "ledger-row" : undefined,
    tabIndex: open ? 0 : undefined,
    onClick: open,
    onKeyDown: open ? (e => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); }
    }) : undefined,
    "data-tone": tone ? "" : undefined,
    style: tone ? { "--row-tone": tone } : undefined,
});

// La celda de acciones: el clic en un botón no debe abrir además el detalle de la fila.
export const stopRow = e => e.stopPropagation();

export const LedgerSkeleton = ({ cols, rows = 8 }) => Array.from({ length: rows }, (_, i) => (
    <tr key={i} aria-hidden="true">
        {Array.from({ length: cols }, (_, j) => (
            <td key={j} className={j === 0 ? "pl-4" : j === cols - 1 ? "pr-4" : ""}>
                <div className={`h-2.5 rounded-full bg-surface-3 dark:bg-white/[0.06] animate-pulse ${["w-16", "w-24", "w-40", "w-20", "w-16 ml-auto", "w-12 ml-auto"][j % 6]}`} />
            </td>
        ))}
    </tr>
));

export const LedgerEmpty = ({ cols, title, hint, onClear }) => (
    <tr>
        <td colSpan={cols} className="!h-auto py-20 text-center !border-b-0">
            <svg className="w-8 h-8 mx-auto mb-3 text-content-subtle/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={ICONS.doc} />
            </svg>
            <div className="text-[13px] font-semibold text-content dark:text-white">{title}</div>
            {hint && <div className="text-[12px] text-content-subtle mt-1">{hint}</div>}
            {onClear && (
                <button onClick={onClear} className="mt-4 h-8 px-3 rounded-lg text-[12px] font-semibold text-content dark:text-white border border-border dark:border-white/10 hover:bg-surface-2 dark:hover:bg-white/5 transition-colors">
                    Quitar filtros
                </button>
            )}
        </td>
    </tr>
);

export const DayRow = ({ cols, label, date, className = "pl-4" }) => (
    <tr className="ledger-day">
        <td colSpan={cols} className={className}>
            <div className="flex items-baseline gap-2.5">
                <span className="text-[14px] font-bold tracking-[-0.01em] text-content dark:text-white">{label}</span>
                {date && <span className="text-[12px] font-medium text-content-subtle tabular-nums">{date}</span>}
            </div>
        </td>
    </tr>
);

// Diario de caja o banco: punto con su color y el nombre en gris. El color crudo del diario
// va solo en el punto, donde no tiene que ser legible.
export const JournalDot = ({ name, color, className = "" }) => (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium text-content-subtle min-w-0 ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-content-subtle/40" style={color ? { backgroundColor: color } : undefined} />
        <span className="truncate">{toNameCase(name)}</span>
    </span>
);

export const ICONS = {
    doc:    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    edit:   "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    undo:   "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6",
    trash:  "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    ban:    "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
    print:  "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z",
    cart:   "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
    eye:    "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
    power:  "M18.364 5.636a9 9 0 11-12.728 0M12 3v9",
};

// Botón de icono de fila. `tone` solo tiñe el hover: en reposo todos van en gris para que
// la fila no se llene de colores.
const HOVER = {
    danger:  "hover:!text-red-600 hover:!bg-red-500/10 dark:hover:!text-red-400",
    warning: "hover:!text-amber-600 dark:hover:!text-amber-400",
    violet:  "hover:!text-violet-600 dark:hover:!text-violet-400",
};
export const RowIcon = ({ icon, title, tone, busy, disabled, className = "", ...props }) => (
    <button className={`row-icon ${HOVER[tone] || ""} ${className}`} title={title} aria-label={title} disabled={busy || disabled} {...props}>
        {busy
            ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS[icon] || icon} /></svg>}
    </button>
);

// El único botón con peso en una fila: la acción que resuelve lo pendiente (cobrar, pagar,
// recibir). En tinta y no en color de marca, que cada empresa elige y puede no contrastar.
export const RowCta = ({ children, className = "", ...props }) => (
    <button
        className={`h-8 px-3 mr-1.5 rounded-lg text-[12px] font-semibold btn-accent active:scale-95 transition-all whitespace-nowrap ${className}`}
        {...props}
    >
        {children}
    </button>
);
