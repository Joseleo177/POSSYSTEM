import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import { fmtDateShort } from "../../helpers";

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

    const inJournalCurrency = `${sym}${(amount * rate).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const rows = [
        ["Referencia", movement.reference || `#${movement.id}`, "text-brand-500 font-black"],
        ["Descripción", movement.description, "uppercase"],
        movement.category_name && ["Categoría", movement.category_name, "uppercase"],
        movement.journal_name && ["Diario", movement.journal_name, "uppercase"],
        ["Fecha", fmtDateShort(movement.date || movement.created_at)],
        !isBase && ["Tasa", `${rate.toFixed(4)} ${sym}/${baseSym}`, "tabular-nums"],
        !isBase && ["Equivalente", `${baseSym}${amount.toFixed(2)}`, "tabular-nums"],
        movement.employee_name && ["Registrado por", movement.employee_name, "uppercase"],
        ["Estado", movement.status, "uppercase"],
        movement.notes && ["Notas", movement.notes],
    ].filter(Boolean);

    return (
        <Modal open={!!movement} onClose={onClose} title={isIncome ? "Detalle del Ingreso" : "Detalle del Egreso"} width={400}>
            <div className="space-y-4">
                <div className="p-4 rounded-xl bg-surface-2 dark:bg-white/5 border border-border/20">
                    <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isIncome ? "text-success" : "text-danger"}`}>
                        Monto
                    </div>
                    <div className="text-3xl font-black tabular-nums">
                        {isIncome ? "+" : "−"}{inJournalCurrency}
                    </div>
                    {!isBase && (
                        <div className="text-[11px] font-bold text-content-subtle dark:text-white/40 tabular-nums mt-1">
                            ≈ {baseSym}{amount.toFixed(2)}
                        </div>
                    )}
                </div>

                <div className="space-y-1">
                    {rows.map(([label, value, extra]) => (
                        <div key={label} className="flex justify-between gap-3 py-2 border-b border-border/10 dark:border-white/5 last:border-0">
                            <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle shrink-0">{label}</span>
                            <span className={`text-[11px] font-bold text-right ${extra || "text-content dark:text-white"}`}>{value}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end pt-6">
                <Button variant="ghost" onClick={onClose}>Cerrar</Button>
            </div>
        </Modal>
    );
}
