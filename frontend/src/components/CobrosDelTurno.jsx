import { fmtMoney, toNameCase } from "../helpers";
import Money from "./ui/Money";

// Lo cobrado en un turno, por cuenta y, dentro de cada cuenta, por método.
//
// Una cuenta ("Bdv") recibe por punto, pago móvil y biopago, y cada uno se cuadra contra un
// papel distinto: el cierre del punto no se compara con el total de la cuenta. Si cobró por
// varios métodos se abre en una línea por método; con uno solo basta nombrarlo al lado.
//
// `items` es `payments_by_journal` del resumen de la sesión. `sinArqueo` (opcional) es el
// conjunto de cuentas que no se cuentan en la gaveta, para marcarlas: transferencias, punto
// o pago móvil entran al turno pero no a ningún conteo.
export default function CobrosDelTurno({ items, sinArqueo }) {
    return (
        <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
            {items.map(p => {
                const metodos = p.methods || [];
                const varios  = metodos.length > 1;
                const unico   = metodos.length === 1 && p.journal_type !== "efectivo" ? metodos[0].name : null;
                const sym     = p.currency_symbol || "Ref.";
                return (
                    <div key={p.id} className="py-2.5">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.journal_color || "#94a3b8" }} />
                                <span className="text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(p.journal_name)}</span>
                                {unico && <span className="text-[12px] text-content-subtle truncate">· {unico}</span>}
                                <span className="text-[12px] text-content-subtle shrink-0">{p.payment_count} {p.payment_count === 1 ? "cobro" : "cobros"}</span>
                                {sinArqueo?.has(p.id) && (
                                    <span className="hidden sm:inline text-[11px] text-content-subtle border border-border dark:border-white/10 rounded-md px-1.5 py-px shrink-0">Sin arqueo</span>
                                )}
                            </div>
                            <Money value={fmtMoney(p.total, sym)} className="text-[13px] font-semibold text-content dark:text-white" />
                        </div>
                        {varios && (
                            <div className="mt-1.5 ml-4 pl-3 border-l border-border/70 dark:border-white/[0.08] space-y-1">
                                {metodos.map(m => (
                                    <div key={m.code || "-"} className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[12px] text-content dark:text-white/85 truncate">{m.name}</span>
                                            <span className="text-[12px] text-content-subtle shrink-0">{m.payment_count}</span>
                                        </div>
                                        <Money value={fmtMoney(m.total, sym)} className="text-[12px] font-medium text-content dark:text-white/85" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
