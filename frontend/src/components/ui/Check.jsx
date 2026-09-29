// Casilla de selección para listas (cobro conjunto, pago conjunto).
//
// Las que había eran un cuadro con borde al 30–40 % de opacidad: sobre el panel blanco no se
// veían, y no había forma de saber que la fila se podía marcar. Esta lleva borde entero en
// reposo y, marcada, relleno de tinta con el check en blanco: se lee igual con cualquier color
// de marca, que es lo que no garantizaba el turquesa o el verde de antes.
//
// Deshabilitada no se esconde (antes bajaba a opacity-20 y parecía un hueco): queda con
// fondo gris y el motivo va en `title`.
export default function Check({ checked, disabled, onChange, title, className = "" }) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={!!checked}
            aria-label={title}
            title={title}
            disabled={disabled}
            onClick={e => { e.stopPropagation(); if (!disabled) onChange?.(!checked); }}
            className={`w-[18px] h-[18px] shrink-0 rounded-[5px] flex items-center justify-center transition-colors print-hidden
                focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1
                ${checked
                    ? "bg-brand-600 border border-brand-600 text-white dark:bg-brand-500 dark:border-brand-500 dark:text-brand-ink"
                    : disabled
                        ? "bg-surface-3 border border-border cursor-not-allowed dark:bg-white/[0.04] dark:border-white/10"
                        : "bg-white border-[1.5px] border-content-subtle/60 hover:border-content dark:bg-transparent dark:border-white/35 dark:hover:border-white/70"}
                ${className}`}
        >
            {checked && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                </svg>
            )}
        </button>
    );
}
