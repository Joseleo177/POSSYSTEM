import { useState } from "react";
import { api } from "../../services/api";
import { buildSalesExcel } from "../../helpers/excel";
import { printSalesReport } from "../../helpers/printSalesReport";
import { useApp } from "../../context/AppContext";
import {
 fmt$, fmtN, pct, METHOD_COLORS,
 useReport, defaultRange, useHourRange,
 DateRangePicker, HourRangePicker, NightShiftNotice, KpiCard, SectionHeader, Card, Loading,
 ExportButton, ProgressBar, BarChart, HeatmapHours,
} from "./reportes.utils";

export default function SalesReport() {
 const [range, setRange] = useState(defaultRange(30));
 const hr = useHourRange();
 const { data, loading, error } = useReport(api.reports.sales, { date_from: range.from, date_to: range.to, ...hr.params }, [range, hr.key]);
 const s = data?.summary;
 // La distribución de canales se mide contra lo cobrado, no contra el ingreso bruto: son
 // cortes distintos —una venta a crédito factura sin entrar a caja, y un abono de una factura
 // vieja entra a caja sin facturar hoy—, así que dividir entre las ventas daba porcentajes
 // que no sumaban 100.
 const totalCobrado = (data?.by_method || []).reduce((acc, m) => acc + parseFloat(m.total || 0), 0);
 const { companyInfo, baseCurrency, notify } = useApp();
 const [pdfLoading, setPdfLoading] = useState(false);

 // El desglose por producto no viene con el reporte de la pantalla —esta vista muestra
 // resúmenes, no el catálogo entero—, así que se pide al generar el PDF. `limit` alto: el
 // papel lleva TODO lo vendido en el período, no el top 20 de la pantalla.
 const generarPdf = async () => {
   setPdfLoading(true);
   try {
     // La misma franja que la pantalla, o el detalle por producto del PDF no cuadraría con
     // los totales que lo encabezan.
     const r = await api.reports.products({ date_from: range.from, date_to: range.to, ...hr.params, limit: 1000 });
     printSalesReport(data, r.data?.top_by_revenue || r.top_by_revenue || [], { ...range, ...hr.params }, companyInfo, baseCurrency);
   } catch (e) {
     notify?.(e.message || "No se pudo generar el reporte", "err");
   } finally {
     setPdfLoading(false);
   }
 };

 return (
 <div className="h-full flex flex-col space-y-4 overflow-auto">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
 <div className="flex items-center gap-2 flex-wrap">
 <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
 <HourRangePicker from={hr.hours.from} to={hr.hours.to} onChange={hr.setHours} />
 {hr.nocturna && <NightShiftNotice from={hr.hours.from} to={hr.hours.to} />}
 </div>
 {data && (
 <div className="flex items-center gap-2">
 <button
 onClick={generarPdf}
 disabled={pdfLoading}
 title="Reporte del período en PDF, con el detalle por producto"
 className="shrink-0 whitespace-nowrap flex items-center gap-2 px-3 sm:px-4 py-2 text-[11px] font-black uppercase tracking-wide rounded-xl border border-danger/30 text-danger bg-danger/5 hover:bg-danger hover:text-white transition-all shadow-sm disabled:opacity-60"
 >
 {pdfLoading ? (
 <div className="w-4 h-4 shrink-0 border-2 border-danger/30 border-t-danger rounded-full animate-spin" />
 ) : (
 <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
 </svg>
 )}
 <span className="hidden sm:inline">{pdfLoading ? "Generando..." : "Reporte PDF"}</span>
 <span className="sm:hidden">PDF</span>
 </button>
 <ExportButton onClick={() => buildSalesExcel(data, { ...range, ...hr.params })} />
 </div>
 )}
 </div>

 {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
 {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-wide">{error}</div>}

 {!loading && !error && data && (
 <div className="flex-1 min-h-0 space-y-3 overflow-auto">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <KpiCard label="Volumen de Ventas" value={fmtN(s.total_sales)} icon="" color="text-brand-500" />
 <KpiCard label="Ingresos Brutos" value={fmt$(s.total_revenue)} sub={s.total_returned > 0 ? `Devol.: ${fmt$(s.total_returned)}` : null} icon="" color="text-green-500" />
 <KpiCard label="Ticket Promedio" value={fmt$(s.avg_ticket)} sub={`Máx: ${fmt$(s.max_sale)}`} icon="" color="text-blue-500" />
 <KpiCard label="Cuentas x Cobrar" value={fmt$(s.pending_amount)} sub={`${s.pending_count} facturas`} icon="" color="text-danger" />
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
 <Card className="lg:col-span-2">
 <SectionHeader title="Ingresos Cronológicos" sub="Flujo de caja diario" />
 {data.by_day.length > 0 ? (
 <div className="pt-2">
 <BarChart data={data.by_day} xKey="day" yKey="revenue" color="#FFB800" height={140} />
 </div>
 ) : (
 <div className="h-[140px] flex items-center justify-center text-[11px] font-black uppercase tracking-wide text-content-subtle">Sin Data</div>
 )}
 </Card>

 <Card>
 <SectionHeader title="Canales de Pago" sub="Cobrado en el período" />
 <div className="space-y-3 pt-1">
 {data.by_method.length === 0 ? (
 <div className="py-10 text-center text-[11px] font-black uppercase text-content-subtle tracking-wide">Sin Registros</div>
 ) : (
 data.by_method.map(m => (
 <div key={m.method_name} className="group">
 <div className="flex justify-between items-end mb-1">
 <div className="flex flex-col">
 <span className="text-[11px] font-black uppercase tracking-wider text-content dark:text-white">{m.method_name}</span>
 <span className="text-[10px] font-bold text-content-subtle">{m.count} trans.</span>
 </div>
 <div className="text-right">
 <div className="text-[11px] font-black text-content dark:text-white tabular-nums">{fmt$(m.total)}</div>
 <div className="text-[10px] font-black text-brand-500">{pct(m.total, totalCobrado)}%</div>
 </div>
 </div>
 <ProgressBar value={m.total} max={totalCobrado} color={METHOD_COLORS[m.method_type] || "bg-brand-500"} />
 </div>
 ))
 )}
 </div>
 </Card>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
 <Card>
 <SectionHeader title="Sectores de Calor" sub="Actividad por hora" />
 <div className="pt-2">
 <HeatmapHours data={data.by_hour} />
 </div>
 {data.by_hour.length > 0 && (() => {
 const peak = data.by_hour.reduce((a, b) => parseFloat(b.revenue) > parseFloat(a.revenue) ? b : a, data.by_hour[0]);
 return (
 <div className="mt-3 p-2 bg-brand-500/5 rounded-xl border border-dashed border-brand-500/20 flex items-center justify-between">
 <span className="text-[10px] font-black uppercase tracking-wide text-content-subtle opacity-60">Pico de Actividad</span>
 <span className="text-[11px] font-black text-brand-500">{peak.hour}:00 – {parseInt(peak.hour) + 1}:00 <span className="mx-1 opacity-20">/</span> {fmt$(peak.revenue)}</span>
 </div>
 );
 })()}
 </Card>

 <Card>
 <SectionHeader title="Fuerza de Ventas" sub="Rendimiento Individual" />
 <div className="space-y-4 pt-2">
 {data.by_employee.map((e, i) => {
 const maxRev = data.by_employee[0]?.revenue || 1;
 return (
 <div key={i} className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-xl bg-surface-3 dark:bg-white/5 flex items-center justify-center text-[11px] font-black text-brand-500 border border-border dark:border-white/5">{i + 1}</div>
 <div className="flex-1 min-w-0">
 <div className="flex justify-between items-end mb-1">
 <div className="flex flex-col truncate">
 <span className="text-[11px] font-black uppercase tracking-wider truncate text-content dark:text-white">{e.employee_name || "Desconocido"}</span>
 <span className="text-[10px] font-bold text-content-subtle">{e.count} ventas · {fmt$(e.avg_ticket)} prom.</span>
 </div>
 <span className="text-[11px] font-black text-green-500 tabular-nums">{fmt$(e.revenue)}</span>
 </div>
 <ProgressBar value={e.revenue} max={maxRev} color="bg-green-500" />
 </div>
 </div>
 );
 })}
 </div>
 </Card>
 </div>
 </div>
 )}
 </div>
 );
}
