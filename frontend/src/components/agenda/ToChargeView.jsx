import Money from "../ui/Money";
import { ledgerRow, stopRow, LedgerEmpty } from "../ui/Ledger";
import { useApp } from "../../context/AppContext";
import { fmtMoney, toNameCase } from "../../helpers";
import { hhmm, fechaCorta, COLORES } from "./shared";

// Citas terminadas cuya cuenta falta cobrar, de cualquier día: la lista de la recepción. Quien
// no cobra (el barbero sin caja) la ve para saber qué le falta a la caja.
const COLS = 6;

export default function ToChargeView({ rows, resources, canCharge, onOpen, onCharge }) {
    const { baseCurrency } = useApp();
    const sym = baseCurrency?.symbol || "Ref.";
    const idx = (id) => resources.findIndex(r => r.id === id);
    const nombre = (id) => toNameCase(resources[idx(id)]?.name) || "—";
    const color = (id) => resources[idx(id)]?.color || COLORES[Math.max(0, idx(id)) % COLORES.length];
    const total = rows.reduce((t, a) => t + (a.sale_total || 0), 0);

    if (!rows.length) {
        return (
            <div className="py-16 text-center px-6">
                <div className="w-12 h-12 mx-auto rounded-xl bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div className="text-[14px] font-semibold text-content dark:text-white mt-3">Nada por cobrar</div>
                <div className="text-[13px] text-content-subtle mt-1">Las citas terminadas aparecen aquí hasta que se cobran.</div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
            <div className="px-4 pt-3 flex items-baseline gap-2">
                <span className="text-[12px] text-content-subtle">{rows.length} cuenta{rows.length === 1 ? "" : "s"} por cobrar</span>
                <Money value={fmtMoney(total, sym)} className="text-[13px] font-semibold text-content dark:text-white" />
            </div>

            <div className="hidden md:flex flex-1 min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[760px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4 w-[130px]">Terminó</th>
                                <th>Cliente</th>
                                <th className="w-[160px]">Profesional</th>
                                <th>Servicios</th>
                                <th className="w-[120px] text-right">Total</th>
                                <th className="w-[150px] pr-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? <LedgerEmpty cols={COLS} title="Nada por cobrar" /> : rows.map(a => (
                                <tr key={a.id} {...ledgerRow(() => onOpen(a))} className="ledger-row">
                                    <td className="pl-4 text-[13px] tabular-nums text-content dark:text-white whitespace-nowrap">
                                        {fechaCorta(a.date)} · {hhmm(a.end_min % 1440)}
                                    </td>
                                    <td className="max-w-0">
                                        <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(a.customer_name) || "Sin nombre"}</div>
                                        <div className="text-[12px] text-content-subtle truncate">{a.customer_id ? (a.customer_doc || "Registrado") : "Sin registrar"}</div>
                                    </td>
                                    <td className="text-[13px] text-content dark:text-white">
                                        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: color(a.resource_id) }} />{nombre(a.resource_id)}</span>
                                    </td>
                                    <td className="max-w-0 text-[13px] text-content-subtle truncate">{a.items.map(i => i.name).join(" + ")}</td>
                                    <td className="text-right text-[13px] font-semibold text-content dark:text-white"><Money value={fmtMoney(a.sale_total, sym)} /></td>
                                    <td className="pr-4 text-right" onClick={stopRow}>
                                        {canCharge && (
                                            <button type="button" onClick={() => onCharge(a)} className="btn-accent h-8 px-3 rounded-lg text-[12px] font-semibold">Cobrar</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="md:hidden px-4 py-3 space-y-2">
                {rows.map(a => (
                    <div key={a.id} className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3"
                        style={{ borderLeft: `3px solid ${color(a.resource_id)}` }}>
                        <button type="button" onClick={() => onOpen(a)} className="w-full text-left">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(a.customer_name) || "Sin nombre"}</span>
                                <Money value={fmtMoney(a.sale_total, sym)} className="text-[14px] font-semibold text-content dark:text-white shrink-0" />
                            </div>
                            <div className="text-[12px] text-content-subtle mt-0.5 truncate">
                                {nombre(a.resource_id)} · {fechaCorta(a.date)} {hhmm(a.end_min % 1440)} · {a.items.map(i => i.name).join(" + ")}
                            </div>
                        </button>
                        {canCharge && (
                            <button type="button" onClick={() => onCharge(a)} className="btn-accent w-full h-12 mt-3 rounded-lg text-[13px] font-semibold">
                                Cobrar {fmtMoney(a.sale_total, sym)}
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
