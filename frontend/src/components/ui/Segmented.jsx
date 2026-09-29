// Control segmentado: una sola opción activa entre pocas (estado, vista, tipo).
// Pastilla blanca levantada sobre un riel gris, como el de iOS: se lee como "uno de estos"
// sin pintar de color la opción activa. `count` opcional muestra cuántos hay en cada una.
export default function Segmented({ options, value, onChange, className = "" }) {
    return (
        <div role="tablist" className={`inline-flex items-center p-[3px] gap-[2px] rounded-lg bg-surface-3 dark:bg-white/[0.06] ${className}`}>
            {options.map(o => {
                const on = o.key === value;
                return (
                    <button
                        key={o.key}
                        role="tab"
                        aria-selected={on}
                        onClick={() => onChange(o.key)}
                        className={`h-[30px] px-3 rounded-md text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-all ${on
                            ? "bg-white text-brand-700 font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)] dark:bg-white/15 dark:text-brand-300"
                            : "text-content-subtle hover:text-content dark:text-white/55 dark:hover:text-white"}`}
                    >
                        {o.label}
                        {o.count != null && (
                            <span className={`text-[11px] tabular-nums ${on ? "text-content-subtle dark:text-white/60" : "text-content-subtle/70 dark:text-white/35"}`}>
                                {o.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
