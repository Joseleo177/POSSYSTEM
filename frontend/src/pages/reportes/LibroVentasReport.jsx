import { useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import SucursalFilter, { useSucursalFilter } from "../../components/ui/SucursalFilter";
import Segmented from "../../components/ui/Segmented";
import { fmtNumber, todayISO } from "../../helpers";
import { buildLibroVentasExcel } from "../../helpers/excel";
import { printLibroVentas } from "../../helpers/printLibroVentas";
import { columnasLibro } from "../../helpers/iva";
import { useReport, usePagination, Pagination, DateRangePicker, SectionHeader, Loading, ExportButton, KpiCard, REPORT_BTN } from "./reportes.utils";

// Libro de ventas (IVA): facturas y notas de crédito del período, en la moneda local y
// desglosadas por alícuota. Es lo que el contador pide cada mes para declarar. Las anuladas se
// quedan en el libro con sus montos en cero: el correlativo no puede tener huecos.

// Del primero del mes a hoy: el libro es mensual.
function mesEnCurso() {
    const hoy = todayISO();
    return { from: `${hoy.slice(0, 8)}01`, to: hoy };
}

// El contribuyente especial declara por quincena; el resto, por mes. Se aplica al mes que esté
// elegido en el rango.
const PERIODOS = [
    { key: "mes", label: "Mes" },
    { key: "q1", label: "1ra quincena" },
    { key: "q2", label: "2da quincena" },
];
function periodoDe(key, desde) {
    const [y, m] = desde.slice(0, 7).split("-").map(Number);
    const mes = `${y}-${String(m).padStart(2, "0")}`;
    const fin = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    if (key === "q1") return { from: `${mes}-01`, to: `${mes}-15` };
    if (key === "q2") return { from: `${mes}-16`, to: fin };
    return { from: `${mes}-01`, to: fin };
}
function periodoActual(r) {
    return PERIODOS.find(p => { const x = periodoDe(p.key, r.from); return x.from === r.from && x.to === r.to; })?.key ?? null;
}

const fecha = (iso) => String(iso || "").split("-").reverse().join("/");
const TH = ({ children, right }) => <th className={`px-4 whitespace-nowrap ${right ? "text-right" : ""}`}>{children}</th>;

// Estado del documento en pocas palabras, en gris: nada aquí pide atención, solo se aclara.
const nota = (d) => (d.anulada ? "03-Anulación" : d.sin_iva ? "Sin IVA" : d.ajuste ? "Redondeo del IVA" : null);
const tipoDoc = (d) => ({ FAC: "Factura", NC: "Nota de crédito", ND: "Nota de débito" }[d.tipo_documento] || "");

export default function LibroVentasReport() {
    const { companyInfo } = useApp();
    const [range, setRange] = useState(mesEnCurso);
    const suc = useSucursalFilter({ soloVenden: true });

    const { data, loading, error } = useReport(
        api.reports.libroVentas,
        { date_from: range.from, date_to: range.to, warehouse_id: suc.warehouseId },
        [range.from, range.to, suc.warehouseId]
    );

    const local = data?.local_symbol || "Bs.";
    const fmtL = (n) => `${local} ${fmtNumber(n || 0, 2)}`;
    const n2 = (n) => fmtNumber(n || 0, 2);
    const cols = columnasLibro(data);
    const s = data?.resumen;
    const docs = data?.docs ?? [];
    const pag = usePagination(docs, 50);
    const baseTotal = s ? cols.reduce((a, t) => a + (s.gravado?.[t]?.base || 0), 0) : 0;
    const cliente = (d) => d.nombre || (d.rif ? "—" : "Consumidor final");

    return (
        <div className="lg:h-full flex flex-col space-y-4 lg:overflow-hidden">
            <div className="shrink-0 flex flex-wrap items-center gap-2">
                <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
                <div className="overflow-x-auto scrollbar-hide">
                    <Segmented value={periodoActual(range)} onChange={k => setRange(periodoDe(k, range.from))} options={PERIODOS} />
                </div>
                <SucursalFilter filter={suc} />
                {data && docs.length > 0 && (
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => printLibroVentas(data, range, companyInfo, suc.nombre)} title="Libro de ventas en PDF, carta horizontal" className={REPORT_BTN}>
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            PDF
                        </button>
                        <ExportButton onClick={() => buildLibroVentasExcel(data, { ...range, warehouse_name: suc.nombre || undefined })} />
                    </div>
                )}
            </div>

            {loading && !data && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
            {error && (
                <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-semibold">{error}</div>
            )}

            {data && (
                <div className={`lg:flex-1 lg:min-h-0 flex flex-col space-y-3 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
                        <KpiCard label="Ventas con IVA" value={fmtL(s.total)} sub={`${s.facturas} facturas · ${s.notas} N/C`} />
                        <KpiCard label="Base imponible" value={fmtL(baseTotal)} sub={cols.length > 1 ? `${cols.length} alícuotas` : "Alícuota general 16 %"} />
                        <KpiCard label="Débito fiscal" value={fmtL(s.iva_total)} sub="IVA de las ventas, menos el de las N/C" />
                        <KpiCard label="Exento" value={fmtL(s.exento)} sub={s.anuladas ? `${s.anuladas} anuladas, en cero` : "Productos sin IVA"} />
                    </div>

                    {s.sin_iva > 0 && (
                        <div className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-[13px] text-content dark:text-white">
                            {s.sin_iva === 1 ? "1 documento se emitió" : `${s.sin_iva} documentos se emitieron`} antes de activar el IVA: salen con su total y sin desglose.
                        </div>
                    )}

                    <div className="lg:flex-1 lg:min-h-0 flex flex-col bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none overflow-hidden">
                        <div className="px-4 pt-4 shrink-0">
                            <SectionHeader
                                title="Facturas y notas de crédito"
                                sub={`Montos en ${local} a la tasa de la fecha de cada factura; el total ya incluye el IVA`}
                            />
                        </div>

                        {docs.length === 0 ? (
                            <div className="px-4 py-16 text-center text-[13px] text-content-subtle">Sin documentos en el período</div>
                        ) : (
                            <>
                                {/* Móvil: tarjetas con documento y total arriba, y debajo cliente y desglose. */}
                                <div className="lg:hidden divide-y divide-border/60 dark:divide-white/[0.06] border-t border-border/60 dark:border-white/[0.06]">
                                    {pag.paginated.map(d => (
                                        <div key={`${d.tipo}-${d.id}`} className={`px-4 py-3 ${d.anulada ? "opacity-60" : ""}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-semibold text-content dark:text-white">
                                                        {d.numero}{d.tipo === "nc" && <span className="font-normal text-content-subtle"> · N/C de {d.afectada}</span>}
                                                    </div>
                                                    <div className="text-[12px] text-content-subtle mt-0.5 truncate">
                                                        {fecha(d.fecha)} · {cliente(d)}{d.rif ? ` · ${d.rif}` : ""}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div className="text-[13px] font-semibold text-content dark:text-white tabular-nums">{fmtL(d.total)}</div>
                                                    {nota(d) && <div className="text-[12px] text-content-subtle">{nota(d)}</div>}
                                                </div>
                                            </div>
                                            {!d.anulada && !d.sin_iva && (
                                                <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1.5">
                                                    {[
                                                        ["Base", cols.reduce((a, t) => a + (d.gravado?.[t]?.base || 0), 0)],
                                                        ["IVA", d.iva_total],
                                                        ["Exento", d.exento],
                                                    ].map(([label, v]) => (
                                                        <div key={label} className="min-w-0">
                                                            <div className="text-[12px] text-content-subtle">{label}</div>
                                                            <div className="text-[13px] tabular-nums font-semibold text-content dark:text-white truncate">{n2(v)}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <div className="hidden lg:block flex-1 min-h-0 overflow-auto">
                                    <table className="table-ledger">
                                        <thead className="sticky top-0 z-10">
                                            <tr>
                                                <TH>Fecha</TH>
                                                <TH>Documento</TH>
                                                <TH>Cliente</TH>
                                                <TH right>Total</TH>
                                                <TH right>Exento</TH>
                                                {cols.map(t => [
                                                    <TH key={`b${t}`} right>Base {t} %</TH>,
                                                    <TH key={`i${t}`} right>IVA {t} %</TH>,
                                                ])}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pag.paginated.map(d => (
                                                <tr key={`${d.tipo}-${d.id}`} className={d.anulada ? "text-content-subtle" : ""}>
                                                    <td className="px-4 tabular-nums whitespace-nowrap">{fecha(d.fecha)}</td>
                                                    <td className="px-4 whitespace-nowrap">
                                                        <div className="font-semibold">{d.numero}</div>
                                                        <div className="text-[12px] text-content-subtle">
                                                            {[d.tipo === "nc" ? `${tipoDoc(d)} de ${d.afectada}` : tipoDoc(d), nota(d)].filter(Boolean).join(" · ")}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 max-w-[260px]">
                                                        <div className="truncate" title={cliente(d)}>{cliente(d)}</div>
                                                        {d.rif && <div className="text-[12px] text-content-subtle tabular-nums">{d.rif}</div>}
                                                    </td>
                                                    <td className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">{n2(d.total)}</td>
                                                    <td className="px-4 text-right tabular-nums whitespace-nowrap">{n2(d.exento)}</td>
                                                    {cols.map(t => [
                                                        <td key={`b${t}`} className="px-4 text-right tabular-nums whitespace-nowrap">{n2(d.gravado?.[t]?.base)}</td>,
                                                        <td key={`i${t}`} className="px-4 text-right tabular-nums whitespace-nowrap">{n2(d.gravado?.[t]?.iva)}</td>,
                                                    ])}
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="sticky bottom-0">
                                            <tr>
                                                <td className="px-4 font-semibold" colSpan={3}>Total del período</td>
                                                <td className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">{n2(s.total)}</td>
                                                <td className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">{n2(s.exento)}</td>
                                                {cols.map(t => [
                                                    <td key={`b${t}`} className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">{n2(s.gravado?.[t]?.base)}</td>,
                                                    <td key={`i${t}`} className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">{n2(s.gravado?.[t]?.iva)}</td>,
                                                ])}
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                <Pagination page={pag.page} totalPages={pag.totalPages} total={pag.total} onPage={pag.setPage} />
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
