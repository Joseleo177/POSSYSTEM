import Modal from "../ui/Modal";
import { fmtDateShort, toNameCase } from "../../helpers";
import StatusMark from "../ui/StatusMark";
import Money from "../ui/Money";
import { JournalDot } from "../ui/Ledger";

// Un movimiento vigente es lo normal: gris con su visto. Solo el anulado se distingue.
const MOVEMENT_STATUS = {
    activo:  { label: "Activo",  tone: "success", quiet: "check" },
    anulado: { label: "Anulado", tone: "neutral", quiet: "void" },
};

/**
 * Detalle de un ingreso o egreso manual.
 *
 * Ingresos y egresos comparten forma —el backend devuelve los mismos campos para ambos— así
 * que comparten modal: mantener dos copias garantizaba que un día divergieran en qué muestran
 * o en cómo convierten la tasa.
 *
 * El monto grande va en la moneda del diario y, debajo, la tasa y el equivalente en base. Sin
 * ese par no había forma de conciliar un movimiento en bolívares con los reportes, que suman
 * en base. Ambas líneas se omiten cuando el movimiento ya es en moneda base: con rate = 1 no
 * dirían nada.
 *
 * @param {object}  movement  fila de incomes/expenses tal como la devuelve el listado
 * @param {"ingreso"|"egreso"} type
 */
export default function MovementDetailModal({ movement, type, baseSym = "Ref.", onClose }) {
    if (!movement) return null;

    const isIncome = type === "ingreso";
    const rate   = parseFloat(movement.rate) || 1;
    const sym    = movement.currency_symbol || baseSym;
    const isBase = rate === 1;
    const amount = Number(movement.amount || 0);
    const anulado = movement.status === "anulado";

    // Sin separador de miles, como el resto de la app: "Bs.1.919.955,00" se leía distinto al
    // "Bs. 1919955.00" de la caja y los reportes. El signo lo lleva la cifra.
    const inJournalCurrency = `${isIncome ? "+" : "-"}${sym} ${(amount * rate).toFixed(2)}`;

    const rows = [
        ["Referencia", movement.reference || `#${movement.id}`],
        movement.category_name && ["Categoría", movement.category_name],
        ["Fecha", fmtDateShort(movement.date || movement.created_at)],
        movement.employee_name && ["Registró", toNameCase(movement.employee_name)],
        movement.status && ["Estado", <StatusMark key="st" status={movement.status} map={MOVEMENT_STATUS} />],
        movement.notes && ["Notas", movement.notes],
    ].filter(Boolean);

    return (
        <Modal open={!!movement} onClose={onClose} title={isIncome ? "Detalle del ingreso" : "Detalle del egreso"} width={420}>
            <div className="space-y-4">
                {/* Cifra héroe: por qué caja entró o salió, cuánto y para qué. */}
                <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                        <JournalDot name={movement.journal_name || "Sin caja"} color={movement.journal_color} />
                        <span className="text-[12px] text-content-subtle shrink-0">{isIncome ? "Ingreso" : "Egreso"}</span>
                    </div>
                    <Money
                        value={inJournalCurrency}
                        strike={anulado}
                        className={`block mt-1 text-[24px] font-bold tracking-tight leading-tight ${anulado ? "text-content-subtle" : "text-content dark:text-white"}`}
                    />
                    {!isBase && (
                        <p className="mt-0.5 text-[12px] text-content-subtle tabular-nums">
                            <Money value={`≈ ${baseSym} ${amount.toFixed(2)}`} /> · tasa {rate.toFixed(4)}
                        </p>
                    )}
                    {movement.description && (
                        <p className="mt-2.5 pt-2.5 border-t border-border/60 dark:border-white/[0.06] text-[13px] font-medium text-content dark:text-white leading-snug">
                            {movement.description}
                        </p>
                    )}
                </div>

                <dl className="divide-y divide-border/60 dark:divide-white/[0.06]">
                    {rows.map(([label, value]) => (
                        <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                            <dt className="text-[12px] text-content-subtle whitespace-nowrap shrink-0">{label}</dt>
                            <dd className="text-[13px] font-medium text-content dark:text-white text-right tabular-nums min-w-0 break-words">{value}</dd>
                        </div>
                    ))}
                </dl>
            </div>

            <div className="flex justify-end mt-5 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                <button onClick={onClose} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-medium">Cerrar</button>
            </div>
        </Modal>
    );
}
