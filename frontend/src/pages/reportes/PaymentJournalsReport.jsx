import { useState, useEffect, useRef } from "react";
import { api } from "../../services/api";
import FilterPopover from "../../components/ui/FilterPopover";
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

// Fila de resumen de lo cargado a mano. Se dibuja apagada cuando no hubo movimiento: una
// fila de guiones deja claro que se miró y no había nada, que no es lo mismo que faltar.
function ManualRow({ label, summary, journals, sign, tone, fmtJ, fmtB }) {
    const hay = (summary?.tx_count || 0) > 0;
    return (
        <tr className={`border-t border-border/60 dark:border-white/5 ${hay ? "" : "opacity-40"}`}>
            <td className={`px-4 py-2 font-black uppercase tracking-wide whitespace-nowrap text-[10px] ${hay ? tone : "text-content-muted dark:text-content-dark-muted"}`}>
                {label}
                {hay && (
                    <span className="ml-1.5 font-bold opacity-60 normal-case tracking-normal">
                        ({summary.tx_count})
                    </span>
                )}
            </td>
            {journals.map(j => {
                const c = summary?.cells?.[j.id];
                return (
                    <td key={j.id} className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                        {c ? (
                            <>
                                <div className={`font-black ${tone}`}>{sign} {fmtJ(c.amount_journal, j.currency_symbol)}</div>
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
            <td className={`px-4 py-2 text-right font-black tabular-nums whitespace-nowrap ${hay ? tone : "opacity-20"}`}>
                {hay ? `${sign} ${fmtB(summary.total_base)}` : "—"}
            </td>
        </tr>
    );
}

export default function PaymentJournalsReport() {
    const [range, setRange] = useState(defaultRange(30));
    // Filtros de corte: quién cobró y con qué serie se facturó. Varios a la vez, porque la
    // pregunta habitual es por un turno completo ("los tres cajeros de la mañana") o por un
    // punto de venta con su propia numeración, no por uno solo.
    const [empSel, setEmpSel]     = useState([]);
    const [serieSel, setSerieSel] = useState([]);
    const [showFilters, setShowFilters] = useState(false);
    const filtrosBtnRef = useRef(null);
    const [empleados, setEmpleados] = useState([]);
    const [series, setSeries]       = useState([]);

    useEffect(() => {
        api.employees.getAll().then(r => setEmpleados(r.data || [])).catch(() => setEmpleados([]));
        // Las notas de crédito no cobran: no tienen sentido como corte de este reporte.
        api.series.getAll().then(r => setSeries((r.data || []).filter(s => s.type !== "nc"))).catch(() => setSeries([]));
    }, []);

    const params = { date_from: range.from, date_to: range.to };
    if (empSel.length)   params.employee_ids = empSel.join(",");
    if (serieSel.length) params.serie_ids    = serieSel.join(",");

    const { data, loading, error } = useReport(
        api.reports.paymentJournals,
        params,
        [range.from, range.to, empSel.join(","), serieSel.join(",")]
    );

    const toggle = (setter) => (id) =>
        setter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const filtrosActivos = empSel.length + serieSel.length;

    const journals = data?.journals ?? [];
    const days     = data?.days ?? [];
    const totals   = data?.totals;
    const manual   = data?.manual;

    // Cada diario se muestra en SU moneda: es lo que el cajero contó. El total del día va en
    // la base, que es lo único sumable cuando hay diarios en monedas distintas.
    const fmtJ = (n, sym) => `${sym} ${fmtNumber(n || 0, 2)}`;
    const fmtB = (n) => `Ref. ${fmtNumber(n || 0, 2)}`;

    return (
        <div className="h-full flex flex-col space-y-4 overflow-auto">
            <div className="flex flex-wrap gap-2 justify-between items-center shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                    <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />

                    <div className="relative">
                        <button
                            ref={filtrosBtnRef}
                            onClick={() => setShowFilters(p => !p)}
                            className={`h-9 px-3 rounded-lg text-[11px] font-black uppercase tracking-wide border flex items-center gap-2 transition-all ${filtrosActivos
                                ? "bg-brand-500/10 text-brand-500 border-brand-500/30"
                                : "bg-surface-2 dark:bg-white/5 border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"}`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                            Filtros
                            {filtrosActivos > 0 && (
                                <span className="bg-brand-500 text-black w-4 h-4 rounded flex items-center justify-center text-[9px]">{filtrosActivos}</span>
                            )}
                        </button>

                        <FilterPopover open={showFilters} onClose={() => setShowFilters(false)} anchorRef={filtrosBtnRef}>
                                    {[
                                        { titulo: "Usuario", vacio: "Sin usuarios", items: empleados.map(e => ({ id: e.id, label: e.full_name || e.username })), sel: empSel, set: setEmpSel },
                                        { titulo: "Serie",   vacio: "Sin series",   items: series.map(s => ({ id: s.id, label: s.name })),                     sel: serieSel, set: setSerieSel },
                                    ].map(grupo => (
                                        <div key={grupo.titulo} className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">{grupo.titulo}</div>
                                            {grupo.items.length === 0 ? (
                                                <div className="text-[10px] font-bold text-content-subtle opacity-60">{grupo.vacio}</div>
                                            ) : (
                                                <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                                                    {grupo.items.map(it => {
                                                        const activo = grupo.sel.includes(it.id);
                                                        return (
                                                            <button
                                                                key={it.id}
                                                                onClick={() => toggle(grupo.set)(it.id)}
                                                                className={`w-full px-2 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border text-left truncate transition-all ${activo
                                                                    ? "bg-brand-500 text-black border-brand-500"
                                                                    : "border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"}`}
                                                                title={it.label}
                                                            >
                                                                {it.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {/* Filtrar por serie deja fuera ingresos y egresos manuales: no pertenecen
                                        a ninguna, y el reporte lo avisa para que nadie lea un neto incompleto. */}
                                    {serieSel.length > 0 && (
                                        <div className="px-4 py-2 text-[10px] font-bold text-warning leading-snug border-b border-border/20 dark:border-white/5">
                                            Con serie seleccionada no se incluyen ingresos ni egresos manuales.
                                        </div>
                                    )}
                                    {filtrosActivos > 0 && (
                                        <div className="px-4 py-2">
                                            <button
                                                onClick={() => { setEmpSel([]); setSerieSel([]); }}
                                                className="w-full py-1.5 text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 rounded-lg transition-colors"
                                            >
                                                Limpiar filtros
                                            </button>
                                        </div>
                                    )}
                        </FilterPopover>
                    </div>
                </div>

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
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <KpiCard label="Cobrado en Ventas" value={fmtB(totals?.total_base)} color="text-brand-500" sub="Convertido a moneda base" />
                        <KpiCard label="Movimiento Neto" value={fmtB(manual?.net?.total_base)} color="text-content dark:text-white" sub="Cobros + ingresos − egresos" />
                        <KpiCard label="Cobros" value={fmtNumber(totals?.tx_count || 0, 0)} color="text-blue-500" />
                        <KpiCard label="Diarios con Movimiento" value={fmtNumber(journals.length, 0)} color="text-violet-500" />
                    </div>

                    <SectionHeader
                        title="Cobros por día y diario"
                        sub="La matriz son cobros de ventas; los ingresos y egresos manuales van sumados abajo"
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
                                        <td className="px-4 py-2.5 font-black uppercase tracking-wide text-content dark:text-white whitespace-nowrap">Total ventas</td>
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

                                    {/* Lo cargado a mano en la caja. Va aparte y no dentro de la matriz: una
                                        celda de cobros tiene que poder conciliarse contra el punto o el banco,
                                        y sumarle un ingreso manual la volvería un número que no cuadra con
                                        nada. El detalle movimiento a movimiento está en el Estado de Cuenta. */}
                                    <ManualRow
                                        label="+ Ingresos manuales"
                                        summary={manual?.incomes}
                                        journals={journals}
                                        sign="+"
                                        tone="text-success"
                                        fmtJ={fmtJ}
                                        fmtB={fmtB}
                                    />
                                    <ManualRow
                                        label="− Egresos manuales"
                                        summary={manual?.expenses}
                                        journals={journals}
                                        sign="−"
                                        tone="text-danger"
                                        fmtJ={fmtJ}
                                        fmtB={fmtB}
                                    />

                                    <tr className="border-t-2 border-content/20 dark:border-white/20 bg-brand-500/[0.07]">
                                        <td className="px-4 py-3 font-black uppercase tracking-wide text-content dark:text-white whitespace-nowrap">
                                            Movimiento neto
                                            <div className="text-[9px] font-bold normal-case tracking-normal text-content-muted dark:text-content-dark-muted opacity-70">
                                                Cobros + ingresos − egresos
                                            </div>
                                        </td>
                                        {journals.map(j => {
                                            const c = manual?.net?.cells?.[j.id];
                                            return (
                                                <td key={j.id} className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                                                    <div className="font-black text-content dark:text-white">{fmtJ(c?.amount_journal, j.currency_symbol)}</div>
                                                    {!j.is_base && (
                                                        <div className="text-[10px] font-bold text-content-muted dark:text-content-dark-muted opacity-60">{fmtB(c?.amount_base)}</div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td className="px-4 py-3 text-right font-black text-brand-500 tabular-nums whitespace-nowrap">{fmtB(manual?.net?.total_base)}</td>
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