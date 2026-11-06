// Selector de la tasa con que se cobra en una moneda: "BCV  Bs 8.960,00 | USDT  Bs 11.000,00".
//
// Hay comercios que cobran los bolívares a la tasa USDT además de a la del BCV, por la misma
// caja. Cada método trae su tasa por defecto (Diarios) y el cajero la cambia aquí con un toque,
// viendo ya cuánto es en cada una: elegir sin ver el monto es lo que hace equivocarse.
//
// Misma piel que ui/Segmented (riel gris, pastilla blanca), en dos renglones: nombre y monto.
// Solo aparece si la moneda tiene más de una tasa.
export default function TasaSelector({ opciones, value, onChange, className = "" }) {
    if (!opciones || opciones.length < 2) return null;
    return (
        <div role="tablist" aria-label="Tasa del cobro"
            className={`flex p-[3px] gap-[2px] rounded-lg bg-surface-3 dark:bg-white/[0.06] ${className}`}>
            {opciones.map(o => {
                const on = String(o.id) === String(value);
                return (
                    <button
                        key={o.id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => onChange(o.id)}
                        className={`flex-1 min-w-0 px-3 py-1.5 rounded-md text-left transition-all ${on
                            ? "bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)] dark:bg-white/15"
                            : "hover:bg-white/50 dark:hover:bg-white/[0.04]"}`}
                    >
                        <span className={`block text-[12px] truncate ${on ? "font-semibold text-brand-700 dark:text-brand-300" : "text-content-subtle dark:text-white/55"}`}>
                            {o.label}
                        </span>
                        {o.monto != null && (
                            <span className={`block text-[14px] tabular-nums truncate ${on ? "font-semibold text-content dark:text-white" : "text-content-muted dark:text-white/60"}`}>
                                {o.monto}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
