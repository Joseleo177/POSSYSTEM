import { useState } from "react";
import { api } from "../../services/api";
import { fmtNumber } from "../../helpers/numbers";
import { buildPaymentJournalsExcel } from "../../helpers/excel";
import {
    useReport, defaultRange, DateRangePicker,
    SectionHeader, Loading, ExportButton, KpiCard,
} from "./reportes.utils";

// Cobros por día y por diario de pago.
//
// Nace de un vacío concreto: el Estado de Cuenta de Contabilidad agrupa los diarios por
// banco, así que con dos diarios del mismo banco —un punto de venta y un pago móvil— sus
// montos quedan sumados sin forma de separarlos. Aquí cada diario tiene su columna.
export default function PaymentJournalsReport() {
    const [range, setRange] = useState(defaultRange(30));
    const { data, loading, error } = useReport(
        api.reports.paymentJournals,
        { date_from: range.from, date_to: range.to },
        [range.from, range.to]
    );

    const journals = data?.journals ?? [];
    const days     = data?.days ?? [];
    const totals   = data?.totals;

    // Cada diario se muestra en SU moneda: es lo que el cajero contó. El total del día va en
    // la base, que es lo único sumable cuando hay diarios en monedas distintas.
    const fmtJ = (n, sym) => `${sym} ${fmtNumber(n || 0, 2)}`;
    const fmtB = (n) => `Ref. ${fmtNumber(n || 0, 2)}`;

    return (
        <div className="h-full flex flex-col space-y-4 overflow-auto">
            <div className="flex flex-wrap gap-2 justify-between items-center shrink-0">
                <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
                {data && days.length > 0 && (
                    <ExportButton onClick={() => buildPaymentJournalsExcel(data, range)} />
                )}
            </div>

            {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
            {!loading && error && (
                <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-wide">{error}</div>
            )}

            {!loading && !error && data && (
                <div className="flex-1 min-h-0 space-y-3 overflow-auto">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <KpiCard label="Total Cobrado" value={fmtB(totals?.total_base)} color="text-brand-500" sub="Convertido a moneda base" />
                        <KpiCard label="Cobros" value={fmtNumber(totals?.tx_count || 0, 0)} color="text-blue-500" />
                        <KpiCard label="Diarios con Movimiento" value={fmtNumber(journals.length, 0)} color="text-violet-500" />
                    </div>

                    <SectionHeader
                        title="Cobros por día y diario"
                        sub="Solo pagos de ventas — no incluye ingresos ni egresos manuales"
                    />

                    {days.length === 0 ? (
                        <div className="p-12 text-center text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted opacity-60">
                            Sin cobros en el rango seleccionado
                        </div>
                    ) : (
                        // La tabla crece con el número de diarios, así que desplaza dentro de su
                        // propio contenedor en vez de romper el ancho de la página.
                        <div className="bg-white dark:bg-white/5 rounded-xl border border-border dark:border-white/5 shadow-sm overflow-x-auto">
                            <table className="w-full text-[11px] border-collapse">
                                <thead>
                                    <tr className="bg-surface-2 dark:bg-white/5">
                                        <th className="px-4 py-2.5 text-left font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted whitespace-nowrap">Fecha</th>
                                        {journals.map(j => (
                                            <th key={j.id} className="px-4 py-2.5 text-right font-black uppercase tracking-wide whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5 justify-end">
                                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: j.color || "#888" }} />
                                                    <span className="text-content dark:text-white">{j.name}</span>
                                                </span>
                                                <div className="font-bold text-content-muted dark:text-content-dark-muted opacity-60 normal-case">
                                                    {j.bank_name || j.currency_symbol}
                                                </div>
                                            </th>
                                        ))}
                                        <th className="px-4 py-2.5 text-right font-black uppercase tracking-wide text-brand-500 whitespace-nowrap">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {days.map(d => (
                                        <tr key={d.date} className="border-t border-border/60 dark:border-white/5">
                                            <td className="px-4 py-2.5 font-bold text-content dark:text-white whitespace-nowrap tabular-nums">
                                                {d.date.split("-").reverse().join("/")}
                                            </td>
                                            {journals.map(j => {
                                                const c = d.cells[j.id];
                                                return (
                                                    <td key={j.id} className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                                                        {c ? (
                                                            <>
                                                                <div className="font-black text-content dark:text-white">{fmtJ(c.amount_journal, j.currency_symbol)}</div>
                                                                {/* El equivalente solo aporta cuando el diario no está ya en base */}
                                                                {!j.is_base && (
                                                                    <div className="text-[10px] font-bold text-content-muted dark:text-content-dark-muted opacity-60">{fmtB(c.amount_base)}</div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="opacity-20">—</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-4 py-2.5 text-right font-black text-brand-500 tabular-nums whitespace-nowrap">{fmtB(d.total_base)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-content/20 dark:border-white/20 bg-surface-2 dark:bg-white/5">
                                        <td className="px-4 py-2.5 font-black uppercase tracking-wide text-content dark:text-white">Total</td>
                                        {journals.map(j => {
                                            const c = totals?.cells?.[j.id];
                                            return (
                                                <td key={j.id} className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                                                    <div className="font-black text-content dark:text-white">{fmtJ(c?.amount_journal, j.currency_symbol)}</div>
                                                    {!j.is_base && (
                                                        <div className="text-[10px] font-bold text-content-muted dark:text-content-dark-muted opacity-60">{fmtB(c?.amount_base)}</div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td className="px-4 py-2.5 text-right font-black text-brand-500 tabular-nums whitespace-nowrap">{fmtB(totals?.total_base)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}