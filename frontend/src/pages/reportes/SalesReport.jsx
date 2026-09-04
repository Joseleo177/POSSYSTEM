import { useState, useEffect } from "react";
import { api } from "../../services/api";
import CustomSelect from "../../components/ui/CustomSelect";
import { buildSalesExcel } from "../../helpers/excel";
import { printSalesReport } from "../../helpers/printSalesReport";
import { useApp } from "../../context/AppContext";
import { fmtNumber } from "../../helpers/numbers";
import {
 fmt$, fmtN, pct, METHOD_COLORS,
 useReport, defaultRange, useHourRange,
 DateRangePicker, HourRangePicker, NightShiftNotice, KpiCard, SectionHeader, Card, Loading,
 ExportButton, ProgressBar, BarChart, HeatmapHours,
} from "./reportes.utils";

export default function SalesReport() {
 const [range, setRange] = useState(defaultRange(30));
 const hr = useHourRange();

 const { companyInfo, baseCurrency, notify } = useApp();

 // Sucursal. Con varias, este dashboard mezclaba todo: era imposible saber cuánto vendió
 // cada una sin ir sucursal por sucursal a otro reporte.
 const [warehouseId, setWarehouseId] = useState("");
 const [warehouses, setWarehouses] = useState([]);
 useEffect(() => {
  api.warehouses.getAll()
   // Un depósito no vende ni factura: no aporta nada a un reporte de ventas.
   .then(r => setWarehouses((r.data || []).filter(w => w.sells !== false)))
   .catch(e => console.error("[SalesReport] no se pudieron cargar los almacenes:", e));
 }, []);
 const todasLabel = warehouses.length === 1 ? warehouses[0].name : "TODAS LAS SUCURSALES";

 // Serie de facturación. Con una serie por sucursal o por caja, es el corte con el que se
 // separa lo que emitió cada punto. Las notas de crédito no facturan: no son un corte válido
 // de un reporte de ventas, mismo criterio que el reporte de diarios de pago. Cada serie es
 // de UNA sola sucursal, así que con una elegida arriba las de las demás no pueden dar
 // resultados.
 const [serieId, setSerieId] = useState("");
 const [allSeries, setAllSeries] = useState([]);
 useEffect(() => {
  api.series.getAll()
   .then(r => setAllSeries((r.data || []).filter(s => s.type !== "nc")))
   .catch(e => console.error("[SalesReport] no se pudieron cargar las series:", e));
 }, []);
 const series = allSeries.filter(s => !warehouseId || s.warehouse_id === Number(warehouseId));
 // Al cambiar de sucursal, una serie marcada que ya no pertenece a ella queda sin sentido.
 useEffect(() => { setSerieId(""); }, [warehouseId]);
 const serieParams = serieId ? { serie_ids: serieId } : {};
 // Para el encabezado del PDF y el nombre del Excel: un reporte de una sola serie tiene que
 // decir cuál, o es indistinguible del de todas y parece mal sumado.
 const serieNombre = serieId ? (series.find(s => String(s.id) === String(serieId))?.name || "") : "";

 // Igual que serieNombre: el PDF y el Excel tienen que decir de qué sucursal son, o un
 // reporte acotado es indistinguible del de todas.
 const warehouseNombre = warehouseId ? (warehouses.find(w => String(w.id) === String(warehouseId))?.name || "") : "";

 const params = { date_from: range.from, date_to: range.to, warehouse_id: warehouseId, ...hr.params, ...serieParams };
 const { data, loading, error } = useReport(api.reports.sales, params, [range, hr.key, serieId, warehouseId]);
 const s = data?.summary;
 // La distribución de canales se mide contra lo cobrado, no contra el ingreso bruto: son
 // cortes distintos —una venta a crédito factura sin entrar a caja, y un abono de una factura
 // vieja entra a caja sin facturar hoy—, así que dividir entre las ventas daba porcentajes
 // que no sumaban 100.
 const totalCobrado = (data?.by_method || []).reduce((acc, m) => acc + parseFloat(m.total || 0), 0);
 const [pdfLoading, setPdfLoading] = useState(false);

 // El desglose por producto no viene con el reporte de la pantalla —esta vista muestra
 // resúmenes, no el catálogo entero—, así que se pide al generar el PDF. `limit` alto: el
 // papel lleva TODO lo vendido en el período, no el top 20 de la pantalla.
 const generarPdf = async () => {
   setPdfLoading(true);
   try {
     // La misma franja que la pantalla, o el detalle por producto del PDF no cuadraría con
     // los totales que lo encabezan.
     const r = await api.reports.products({ ...params, limit: 1000 });
     printSalesReport(
       data,
       r.data?.top_by_revenue || r.top_by_revenue || [],
       { ...range, ...hr.params, serie_name: serieNombre, warehouse_name: warehouseNombre },
       companyInfo,
       baseCurrency,
     );
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
 {/* Con una sola sucursal no hay nada que elegir: mostrar el selector solo insinuaría que
     hay más, cuando no las hay. */}
 {warehouses.length > 1 && (
 <CustomSelect
  value={warehouseId}
  onChange={setWarehouseId}
  placeholder={todasLabel}
  boxClassName="h-10 min-w-[190px]"
  options={[
   { value: "", label: todasLabel },
   ...warehouses.map(w => ({ value: String(w.id), label: w.name }))
  ]}
 />
 )}
 {/* Con una sola serie, "todas" promete un alcance que no existe: se muestra su nombre.
     Mismo criterio que el selector de sucursal del reporte de márgenes. */}
 {series.length > 0 && (
 <CustomSelect
  value={serieId}
  onChange={setSerieId}
  placeholder={series.length === 1 ? series[0].name : "TODAS LAS SERIES"}
  boxClassName="h-10 min-w-[180px]"
  icon={
   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
   </svg>
  }
  options={[
   { value: "", label: series.length === 1 ? series[0].name : "TODAS LAS SERIES" },
   ...(series.length > 1 ? series.map(s => ({ value: String(s.id), label: s.name })) : []),
  ]}
 />
 )}
 {hr.nocturna && <NightShiftNotice from={hr.hours.from} to={hr.hours.to} dateFrom={range.from} dateTo={range.to} />}
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
 <ExportButton onClick={() => buildSalesExcel(data, { ...range, ...hr.params, serie_name: serieNombre, warehouse_name: warehouseNombre })} />
 </div>
 )}
 </div>

 {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
 {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-wide">{error}</div>}

 {!loading && !error && data && (
 <div className="flex-1 min-h-0 space-y-3 overflow-auto">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {/* Los cuatro miden lo DESPACHADO —la mercancía salió del inventario, se haya cobrado o
     no—, así que monto ÷ ventas vuelve a dar el ticket promedio de al lado. Las anuladas
     no son ventas: van como nota al pie del volumen, no sumadas dentro. */}
 <KpiCard label="Volumen de Ventas" value={fmtN(s.total_sales)} sub={s.cancelled_count > 0 ? `${fmtN(s.cancelled_count)} anuladas aparte` : null} icon="" color="text-brand-500" />
 <KpiCard label="Facturado" value={fmt$(s.total_revenue)} sub={s.total_returned > 0 ? `Devol.: ${fmt$(s.total_returned)}` : "Cobrado y por cobrar"} icon="" color="text-green-500" />
 <KpiCard label="Ticket Promedio" value={fmt$(s.avg_ticket)} sub={`Máx: ${fmt$(s.max_sale)}`} icon="" color="text-blue-500" />
 <KpiCard label="Cuentas x Cobrar" value={fmt$(s.pending_amount)} sub={`${s.pending_count} ventas · ya incluidas arriba`} icon="" color="text-danger" />
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
 <Card className="lg:col-span-2">
 {/* Ya no es flujo de caja: son las ventas del día, cobradas o no. El dinero que entró
     por día vive en el reporte de Diarios de Pago, que sí se corta por fecha de cobro. */}
 <SectionHeader title="Facturación Cronológica" sub="Ventas por día" />
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
 {/* El monto en la moneda del diario manda: es lo que el cajero contó y lo que trae
     el estado de cuenta. La referencia queda debajo porque es lo único comparable
     entre diarios —y lo que miden el porcentaje y la barra—. */}
 <div className="text-right">
 {m.is_base === false && m.currency_symbol ? (
 <>
 <div className="text-[11px] font-black text-content dark:text-white tabular-nums">{m.currency_symbol} {fmtNumber(m.total_journal, 2)}</div>
 <div className="text-[10px] font-bold text-content-subtle tabular-nums">{fmt$(m.total)}</div>
 </>
 ) : (
 <div className="text-[11px] font-black text-content dark:text-white tabular-nums">{fmt$(m.total)}</div>
 )}
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
