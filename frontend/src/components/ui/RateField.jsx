/**
 * Tasa efectiva de una operación: la que el usuario escribió, o la de configuración si
 * dejó el campo vacío. Un valor tecleado inválido o ≤ 0 tampoco sustituye a la configurada:
 * a mitad de tipeo ("7", "75,") no puede quedar un cobro convertido a una tasa absurda.
 */
export const resolveRate = (typed, configuredRate) => {
    const configured = parseFloat(configuredRate) || 1;
    const n = parseFloat(String(typed ?? "").replace(",", "."));
    return !isNaN(n) && n > 0 ? n : configured;
};

/** true si lo tecleado difiere de la tasa de configuración (para avisar y ofrecer restaurar). */
export const isRateEdited = (typed, configuredRate) => {
    const configured = parseFloat(configuredRate) || 1;
    const n = parseFloat(String(typed ?? "").replace(",", "."));
    return !isNaN(n) && n > 0 && Math.abs(n - configured) > 1e-6;
};

/**
 * Campo para escribir la tasa de cambio de UNA operación.
 *
 * Arranca siempre con la tasa de configuración y lo que se teclee vale solo aquí: no toca la
 * tasa global ni los precios del catálogo. En caja la tasa del día del banco no siempre es la
 * que está cargada en el sistema, y hasta ahora eso obligaba a ir a Configuración —
 * cambiándosela a todo el mundo — para poder registrar un solo pago.
 *
 * value vacío = usar la configurada; el placeholder la muestra para que el campo nunca se lea
 * como "sin tasa".
 */
export default function RateField({
    value,
    onChange,
    configuredRate,
    currency,
    disabled = false,
    className = "",
}) {
    const configured = parseFloat(configuredRate) || 1;
    const edited = isRateEdited(value, configured);

    return (
        <div className={className}>
            <div className="relative">
                <input
                    type="text"
                    inputMode="decimal"
                    disabled={disabled}
                    value={value}
                    onChange={e => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder={configured.toFixed(4)}
                    className={[
                        "w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border rounded-xl px-3.5 pr-24",
                        "text-[13px] font-bold tabular-nums text-content dark:text-white outline-none transition-all",
                        "placeholder:text-content-subtle/40 dark:placeholder:text-white/20 disabled:opacity-40",
                        edited
                            ? "border-warning/60 focus:border-warning"
                            : "border-border/20 dark:border-white/[0.08] focus:border-brand-500/60 dark:focus:border-brand-500/50",
                    ].join(" ")}
                />
                {/* Restaurar vuelve al vacío, no a la cifra: así el campo sigue el valor de
                    configuración si esta cambia mientras el modal está abierto. */}
                {edited ? (
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 px-2 rounded-lg bg-warning/10 text-warning border border-warning/30 text-[9px] font-black uppercase tracking-wide hover:bg-warning/20 transition-all"
                    >
                        Restaurar
                    </button>
                ) : (
                    currency?.code && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-wide text-content-subtle/50 dark:text-white/20 pointer-events-none">
                            {currency.code}
                        </span>
                    )
                )}
            </div>
            <p className={`text-[10px] font-bold mt-1 ${edited ? "text-warning" : "text-content-subtle dark:text-white/30"}`}>
                {edited
                    ? `Tasa manual · configurada ${configured.toFixed(4)}`
                    : `Tasa de configuración · ${configured.toFixed(4)}`}
            </p>
        </div>
    );
}
