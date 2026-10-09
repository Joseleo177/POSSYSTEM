import Money from "../ui/Money";
import { JournalDot } from "../ui/Ledger";
import { fmtDateShort } from "../../helpers";

/**
 * Ingreso o egreso manual en el teléfono, donde la tabla de ocho columnas no cabía y cortaba
 * la descripción. Tres renglones: de qué se trata y cuánto; referencia, categoría y estado;
 * diario, fecha y la acción, siempre visible (en táctil no hay hover).
 *
 *   sign      "+" ingreso, "-" egreso
 *   status    el StatusMark ya armado (Registrado / Conciliado / Anulado)
 *   actions   los botones de la fila, ya armados
 */
export default function MovementCard({ m, sign, fmtPrice, status, actions, onOpen }) {
    const anulado = m.status === "anulado";
    const otraMoneda = m.rate && m.rate !== 1;
    const tinta = anulado ? "text-content-subtle" : "text-content dark:text-white";
    return (
        <div role="button" tabIndex={0} onClick={onOpen}
            className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] pl-3.5 pr-2.5 py-3 active:scale-[0.99] transition-transform">
            <div className="flex items-start justify-between gap-3 pr-1">
                <span className={`min-w-0 text-[14px] font-semibold leading-snug line-clamp-2 ${tinta}`}>{m.description}</span>
                <div className="shrink-0 text-right">
                    {otraMoneda ? (
                        <>
                            <Money value={`${sign}${m.currency_symbol} ${(m.amount * m.rate).toFixed(2)}`} strike={anulado} className={`text-[15px] font-semibold ${tinta}`} />
                            <div><Money value={`${sign}${fmtPrice(m.amount)}`} className="text-[12px] text-content-subtle" /></div>
                        </>
                    ) : (
                        <Money value={`${sign}${fmtPrice(m.amount)}`} strike={anulado} className={`text-[15px] font-semibold ${tinta}`} />
                    )}
                </div>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 pr-1">
                <span className="min-w-0 truncate text-[12px] text-content-subtle">
                    <span className={`font-semibold tabular-nums ${anulado ? "line-through decoration-1" : "text-brand-700 dark:text-brand-300"}`}>{m.reference || `#${m.id}`}</span>
                    {m.category_name ? ` · ${m.category_name}` : ""}
                </span>
                <span className="shrink-0">{status}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-1">
                    {m.journal_name ? <JournalDot name={m.journal_name} color={m.journal_color} /> : <span className="text-[12px] text-content-subtle">Sin diario</span>}
                    <span className="text-[12px] text-content-subtle tabular-nums whitespace-nowrap">· {fmtDateShort(m.date ?? m.created_at)}</span>
                </div>
                <div className="shrink-0" onClick={e => e.stopPropagation()}>{actions}</div>
            </div>
        </div>
    );
}
