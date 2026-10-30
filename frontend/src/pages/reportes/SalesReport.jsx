import { useState, useEffect } from "react";
import { api } from "../../services/api";
import CustomSelect from "../../components/ui/CustomSelect";
import { buildSalesExcel } from "../../helpers/excel";
import { printSalesReport } from "../../helpers/printSalesReport";
import { useApp } from "../../context/AppContext";
import { fmtNumber } from "../../helpers/numbers";
import { toNameCase } from "../../helpers";
import { fmtDateShort } from "../../helpers/dates";
import {
 fmt$, fmtN, pct, METHOD_COLORS,
 useReport, defaultRange, useHourRange,
 DateRangePicker, HourRangePicker, NightShiftNotice, KpiCard, SectionHeader, Card, Loading,
 ExportButton, ProgressBar, BarChart, HeatmapHours, Callout, REPORT_BTN,
 DonutChart, DONUT_MAX_SLOTS,
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
 const todasLabel = warehouses.length === 1 ? warehouses[0].name : "Todas las sucursales";

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
 const anteriores = data?.older_payments || [];

 // Tortas por diario. El color se asigna por el peso del diario en TODO lo cobrado, y el
 // mismo diario lleva el mismo color en las tres aunque en una sea el más chico; los que no
 // entran en los primeros tonos se juntan en "Otros".
 const metodos = data?.by_method || [];
 const tortaDe = (campo) => {
  const slices = [];
  let otros = 0;
  metodos.forEach((m, i) => {
   const v = parseFloat(m[campo]) || 0;
   if (i < DONUT_MAX_SLOTS) slices.push({ key: String(i), label: toNameCase(m.method_name), value: v, slot: i });
   else otros += v;
  });
  if (otros > 0) slices.push({ key: "otros", label: "Otros", value: otros, slot: "otros" });
  return slices;
 };
 const [verTodos, setVerTodos] = useState(false);
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
 <div className="lg:h-full flex flex-col space-y-4 lg:overflow-auto">
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
  placeholder={series.length === 1 ? series[0].name : "Todas las series"}
  boxClassName="h-10 min-w-[180px]"
  icon={
   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
   </svg>
  }
  options={[
   { value: "", label: series.length === 1 ? series[0].name : "Todas las series" },
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
 className={REPORT_BTN}
 >
 {pdfLoading ? (
 <div className="w-4 h-4 shrink-0 border-2 border-content-subtle/25 border-t-content-subtle rounded-full animate-spin" />
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
 {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-bold">{error}</div>}

 {!loading && !error && data && (
 <div className="lg:flex-1 lg:min-h-0 space-y-3 lg:overflow-auto">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {/* Facturado y por cobrar miden lo DESPACHADO —la mercancía salió, se haya cobrado o no—.
     Los dos del medio miden la CAJA por fecha del cobro y suman lo de "Canales de pago":
     lo cobrado de ventas del mismo día y lo que entró por ventas de días anteriores. El
     ticket promedio se quitó: no decía nada que sirviera para cuadrar. */}
 <KpiCard
  label="Facturado"
  value={fmt$(s.total_revenue)}
  sub={[
   `${fmtN(s.total_sales)} ${s.total_sales === 1 ? "venta" : "ventas"}`,
   s.total_returned > 0 && `devol. ${fmt$(s.total_returned)}`,
   s.cancelled_count > 0 && `${fmtN(s.cancelled_count)} anuladas aparte`,
  ].filter(Boolean).join(" · ")}
 />
 {/* En el teléfono la tarjeta mide media pantalla y el rótulo largo se cortaba. */}
 <KpiCard
  label={<><span className="sm:hidden">Cobrado del día</span><span className="hidden sm:inline">Cobrado de ventas del día</span></>}
  value={fmt$(s.paid_same_day_amount)}
  sub={`${fmtN(s.paid_same_day_count)} ${s.paid_same_day_count === 1 ? "cobro" : "cobros"}`}
 />
 <KpiCard
  label={<><span className="sm:hidden">Deudas cobradas</span><span className="hidden sm:inline">Cobrado de ventas anteriores</span></>}
  value={fmt$(s.paid_older_amount)}
  sub={s.paid_older_sales > 0
   ? <>{fmtN(s.paid_older_sales)} {s.paid_older_sales === 1 ? "factura" : "facturas"}<span className="hidden sm:inline"> · detalle abajo</span></>
   : "Ninguna en el período"}
 />
 <KpiCard label="Cuentas x cobrar" value={fmt$(s.pending_amount)} sub={`${s.pending_count} ventas del período`} />
 </div>

 {/* Lo cobrado por diario: todo, lo de ventas del día y lo de ventas anteriores. Las tres
     suman lo mismo que "Canales de pago", que queda abajo como la tabla con los Bs. */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
 <Card>
 <SectionHeader title="Cobros por diario" sub="Todo lo cobrado en el período" />
 <DonutChart slices={tortaDe("total")} emptyText="No entró dinero en el período." />
 </Card>
 <Card>
 <SectionHeader title="De ventas del día" sub="Cobrado el mismo día de la venta" />
 <DonutChart slices={tortaDe("total_same_day")} emptyText="Ninguna venta se cobró el mismo día." />
 </Card>
 <Card>
 <SectionHeader title="De ventas anteriores" sub="Deudas de días previos cobradas" />
 <DonutChart slices={tortaDe("total_older")} emptyTitle="Sin cobros de días anteriores" emptyText="Todo lo cobrado fue de ventas del día." />
 </Card>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
 <Card className="lg:col-span-2 flex flex-col">
 {/* Ya no es flujo de caja: son las ventas del día, cobradas o no. El dinero que entró
     por día vive en el reporte de Diarios de Pago, que sí se corta por fecha de cobro.
     `fill`: ocupa el alto que le da "Canales de pago" al lado, en vez de dejar un hueco. */}
 <SectionHeader title="Facturación cronológica" sub="Ventas por día" />
 {data.by_day.length > 0 ? (
 <div className="pt-2 flex-1 flex flex-col">
 <BarChart data={data.by_day} xKey="day" yKey="revenue" fill />
 </div>
 ) : (
 <div className="h-[140px] flex items-center justify-center text-[12px] font-bold text-content-subtle">Sin data</div>
 )}
 </Card>

 <Card>
 <SectionHeader title="Canales de pago" sub="Cobrado en el período" />
 <div className="space-y-3 pt-1">
 {data.by_method.length === 0 ? (
 <div className="py-10 text-center text-[12px] font-bold text-content-subtle">Sin registros</div>
 ) : (
 data.by_method.map(m => (
 <div key={m.method_name} className="group">
 <div className="flex justify-between items-end mb-1">
 <div className="flex flex-col">
 <span className="text-[13px] font-semibold text-content dark:text-white">{toNameCase(m.method_name)}</span>
 <span className="text-[11px] font-semibold text-content-subtle">{m.count} trans.</span>
 </div>
 {/* El monto en la moneda del diario manda: es lo que el cajero contó y lo que trae
     el estado de cuenta. La referencia queda debajo porque es lo único comparable
     entre diarios —y lo que miden el porcentaje y la barra—. */}
 <div className="text-right">
 {m.is_base === false && m.currency_symbol ? (
 <>
 <div className="text-[12px] font-bold text-content dark:text-white tabular-nums">{m.currency_symbol} {fmtNumber(m.total_journal, 2)}</div>
 <div className="text-[11px] font-semibold text-content-subtle tabular-nums">{fmt$(m.total)}</div>
 </>
 ) : (
 <div className="text-[12px] font-bold text-content dark:text-white tabular-nums">{fmt$(m.total)}</div>
 )}
 <div className="text-[12px] text-content-subtle tabular-nums">{pct(m.total, totalCobrado)}%</div>
 </div>
 </div>
 <ProgressBar value={m.total} max={totalCobrado} color={METHOD_COLORS[m.method_type] || "bg-brand-500"} />
 </div>
 ))
 )}
 </div>
 </Card>
 </div>

 {/* Solo aparece si hubo cobros de ventas viejas: un negocio de contado lo vería vacío todos
     los días, y la tarjeta de arriba ya dice Ref. 0,00. */}
 {anteriores.length > 0 && (
 <Card>
 <SectionHeader
  title="Cobros de ventas anteriores"
  sub="Facturas de días previos que se cobraron en el período"
  right={<span className="text-[13px] font-semibold text-content dark:text-white tabular-nums whitespace-nowrap">{fmt$(s.paid_older_amount)}</span>}
 />
 <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
 {(verTodos ? anteriores : anteriores.slice(0, 8)).map(r => (
 <div key={r.sale_id} className="py-2.5">
 <div className="flex items-center justify-between gap-3">
 <span className="text-[13px] font-semibold text-content dark:text-white truncate">
  {toNameCase(r.customer_name) || "Venta casual"}
  <span className="ml-1.5 font-normal text-content-subtle tabular-nums">{r.invoice_number || `#${r.sale_id}`}</span>
 </span>
 <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums whitespace-nowrap">{fmt$(r.amount)}</span>
 </div>
 <div className="mt-0.5 flex items-center justify-between gap-3">
 <span className="text-[12px] text-content-subtle truncate">
  Venta del {fmtDateShort(r.sale_day)}
  <span className="hidden sm:inline"> · {r.days === 1 ? "1 día" : `${fmtN(r.days)} días`} después</span>
  {r.count > 1 && <span className="hidden sm:inline"> · {r.count} cobros</span>}
 </span>
 {r.still_pending
  ? <span className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">Abono, aún debe</span>
  : <span className="text-[12px] text-content-subtle whitespace-nowrap">Saldada</span>}
 </div>
 </div>
 ))}
 </div>
 {anteriores.length > 8 && (
 <button
  onClick={() => setVerTodos(v => !v)}
  className="mt-2 text-[12px] font-semibold text-content-subtle hover:text-content dark:hover:text-white"
 >
  {verTodos ? "Ver menos" : `Ver las ${fmtN(anteriores.length)}`}
 </button>
 )}
 </Card>
 )}

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
 <Card>
 <SectionHeader title="Sectores de calor" sub="Actividad por hora" />
 <div className="pt-2">
 <HeatmapHours data={data.by_hour} />
 </div>
 {data.by_hour.length > 0 && (() => {
 const peak = data.by_hour.reduce((a, b) => parseFloat(b.revenue) > parseFloat(a.revenue) ? b : a, data.by_hour[0]);
 return (
 <Callout label="Pico de actividad">{peak.hour}:00 – {parseInt(peak.hour) + 1}:00 <span className="mx-1.5 text-content-subtle font-normal">·</span> {fmt$(peak.revenue)}</Callout>
 );
 })()}
 </Card>

 <Card>
 <SectionHeader title="Fuerza de ventas" sub="Rendimiento individual" />
 <div className="space-y-4 pt-2">
 {data.by_employee.map((e, i) => {
 const maxRev = data.by_employee[0]?.revenue || 1;
 return (
 <div key={i} className="flex items-center gap-3">
 <div className="w-7 h-7 rounded-full bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center text-[12px] font-semibold text-content-muted tabular-nums shrink-0">{i + 1}</div>
 <div className="flex-1 min-w-0">
 <div className="flex justify-between items-end mb-1">
 <div className="flex flex-col truncate">
 <span className="text-[12px] font-bold truncate text-content dark:text-white">{toNameCase(e.employee_name) || "Desconocido"}</span>
 <span className="text-[11px] font-semibold text-content-subtle">{e.count} ventas · {fmt$(e.avg_ticket)} prom.</span>
 </div>
 <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums">{fmt$(e.revenue)}</span>
 </div>
 <ProgressBar value={e.revenue} max={maxRev} />
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
