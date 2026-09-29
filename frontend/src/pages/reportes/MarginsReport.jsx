import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { buildMarginsExcel } from "../../helpers/excel";
import { fmtDateShort, toNameCase } from "../../helpers";
import CustomSelect from "../../components/ui/CustomSelect";
import Segmented from "../../components/ui/Segmented";
import {
 fmt$,
 useReport, defaultRange, useHourRange, usePagination, Pagination, useExportFull,
 DateRangePicker, HourRangePicker, NightShiftNotice, KpiCard, SectionHeader, Card, Loading, ExportButton, BarChart, Callout,
} from "./reportes.utils";

// Una cifra negativa es lo único que se pinta en esta pantalla: perder dinero con un producto
// sí es una alerta. Lo demás va en tinta —antes ingresos iban en azul, costos en rojo y
// utilidades en verde en cada fila, y el rojo del costo (que es normal) se leía como pérdida—.
const neg = (v) => parseFloat(v) < 0;
const tone = (v, base = "text-content dark:text-white") => neg(v) ? "text-red-600 dark:text-red-400" : base;

const VIEWS = [
 { key: "top",      label: "Mayor margen", title: "Mayor margen" },
 { key: "bottom",   label: "Menor margen", title: "Menor margen" },
 { key: "category", label: "Categorías",   title: "Por categoría" },
];

export default function MarginsReport() {
 const [range, setRange] = useState(defaultRange(30));
 // El margen ahora se puede ver por sucursal: cada una compra a su precio, así que el mismo
 // producto deja utilidades distintas en cada tienda.
 const [warehouseId, setWarehouseId] = useState("");
 const [warehouses, setWarehouses] = useState([]);
 useEffect(() => {
  api.warehouses.getAll()
   .then(r => setWarehouses((r.data || []).filter(w => w.sells !== false)))
   .catch(e => console.error("[MarginsReport] no se pudieron cargar los almacenes:", e));
 }, []);

 const hr = useHourRange();
 const params = { date_from: range.from, date_to: range.to, warehouse_id: warehouseId, ...hr.params };
 const { data, loading, error } = useReport(api.reports.margins, params, [range, warehouseId, hr.key]);
 const exportFull = useExportFull(api.reports.margins, params, (d) => buildMarginsExcel(d, { ...range, ...hr.params }));
 const [view, setView] = useState("top");

 // Con una sola sucursal, "todas" promete un alcance que no existe: la API ya devuelve solo
 // la suya. Mismo criterio que el reporte de inventario.
 const todasLabel = warehouses.length === 1 ? warehouses[0].name : "Todas las sucursales";
 const s = data?.summary;

 const byProductDesc = data?.by_product ?? [];
 const byProductAsc = [...byProductDesc].sort((a, b) => parseFloat(a.margin_pct) - parseFloat(b.margin_pct));
 const topPag = usePagination(byProductDesc);
 const bottomPag = usePagination(byProductAsc);
 const catPag = usePagination(data?.by_category ?? []);

 const handleViewChange = (k) => { setView(k); topPag.setPage(1); bottomPag.setPage(1); catPag.setPage(1); };

 const activePag = view === "top" ? topPag : view === "bottom" ? bottomPag : catPag;

 return (
 <div className="h-full flex flex-col space-y-4 overflow-auto">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
 <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
 <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
 <HourRangePicker from={hr.hours.from} to={hr.hours.to} onChange={hr.setHours} />
 {hr.nocturna && <NightShiftNotice from={hr.hours.from} to={hr.hours.to} dateFrom={range.from} dateTo={range.to} />}
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
 </div>
 {data && <ExportButton onClick={exportFull.run} loading={exportFull.exporting} />}
 </div>

 {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
 {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-red-500/5 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 font-semibold">{error}</div>}

 {!loading && !error && data && (
 <div className="flex-1 min-h-0 space-y-3 overflow-auto">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <KpiCard label="Retorno de inversión" value={`${s.avg_margin_pct || 0}%`} />
 <KpiCard label="Utilidad bruta" value={fmt$(s.total_margin || 0)} />
 <KpiCard label="Ingresos de operación" value={fmt$(s.total_revenue || 0)} />
 <KpiCard label="Costo de mercancía" value={fmt$(s.total_cost || 0)} />
 </div>

 {/* ── Evolución de rentabilidad por día ── */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
 <Card className="lg:col-span-2">
 <SectionHeader title="Flujo de rentabilidad" sub="Ingresos del día, divididos en costo y utilidad" />
 {(data.by_day ?? []).length > 0 ? (
 <>
 {/* Apilado: costo + utilidad = ingreso del día. El costo va en gris —es la parte
     que no se queda— y la utilidad en el color de los gráficos. */}
 <BarChart
  data={data.by_day}
  xKey="day"
  height={180}
  series={[
  { key: "cost",   color: "chart-muted", label: "Costo" },
  { key: "profit", color: "chart",       label: "Utilidad" },
  ]}
 />
 {(() => {
 const peak = data.by_day.reduce((a, b) => parseFloat(b.profit) > parseFloat(a.profit) ? b : a, data.by_day[0]);
 return (
 <Callout label="Mejor día">
  {fmtDateShort(peak.day)} <span className="mx-1.5 text-content-subtle font-normal">·</span> {fmt$(peak.profit)} de utilidad
 </Callout>
 );
 })()}
 </>
 ) : (
 <div className="h-[180px] flex items-center justify-center text-[13px] text-content-subtle">Sin ventas en el período</div>
 )}
 </Card>

 <Card>
 <SectionHeader title="Resumen del período" sub="Resultado neto" />
 <div>
 {[
 { label: "Total vendido", value: s.total_revenue || 0 },
 { label: "Costo total", value: s.total_cost || 0, muted: true },
 { label: "Utilidad bruta", value: s.total_margin || 0, strong: true },
 ].map(row => (
 <div key={row.label} className={`flex justify-between items-center py-2.5 border-b border-border/60 dark:border-white/[0.06] last:border-0 ${row.strong ? "pt-3" : ""}`}>
 <span className={`text-[13px] ${row.strong ? "font-semibold text-content dark:text-white" : "text-content-subtle"}`}>{row.label}</span>
 <span className={`tabular-nums ${row.strong ? "text-[15px] font-bold" : "text-[13px] font-medium"} ${tone(row.value, row.muted ? "text-content-muted" : "text-content dark:text-white")}`}>
 {fmt$(row.value)}
 </span>
 </div>
 ))}
 </div>
 <Callout label="Por cada $100 vendido">
  ${s.avg_margin_pct || 0} de ganancia
 </Callout>
 </Card>
 </div>

 <Segmented value={view} onChange={handleViewChange} options={VIEWS} />

 <Card className="!p-0 min-h-0 flex flex-col overflow-hidden">
 <div className="px-4 pt-4">
 <SectionHeader title={VIEWS.find(v => v.key === view)?.title} sub="Calculado con el costo al momento de cada venta" />
 </div>

 <div className="overflow-x-auto">
 <table className="table-ledger min-w-[640px]">
 <thead>
 {(view === "top" || view === "bottom") && (
 <tr>
 <th className="pl-4 w-16">#</th>
 <th>Producto</th>
 <th className="text-right">Ingresos</th>
 <th className="text-right">Costo</th>
 <th className="text-right">Utilidad</th>
 <th className="text-right pr-4">Margen</th>
 </tr>
 )}
 {view === "category" && (
 <tr>
 <th className="pl-4">Categoría</th>
 <th className="text-right">Ingresos</th>
 <th className="text-right">Utilidad</th>
 <th className="text-right pr-4">Margen</th>
 </tr>
 )}
 </thead>
 <tbody>
 {(view === "top" || view === "bottom") && activePag.paginated.map((p, i) => (
 <tr key={i} data-tone={neg(p.gross_margin) ? "" : undefined} style={neg(p.gross_margin) ? { "--row-tone": "#ef4444" } : undefined}>
 <td className="pl-4">
 <span className="w-6 h-6 rounded-full bg-surface-3 dark:bg-white/[0.06] inline-flex items-center justify-center text-[11px] font-semibold text-content-muted tabular-nums">{(activePag.page - 1) * 25 + i + 1}</span>
 </td>
 <td className="max-w-0">
 <div className="font-semibold text-content dark:text-white truncate">{p.product_name}</div>
 <div className="text-[12px] text-content-subtle truncate">{toNameCase(p.category_name)}</div>
 </td>
 <td className="text-right text-[13px] font-medium text-content dark:text-white">{fmt$(p.revenue)}</td>
 <td className="text-right text-[13px] text-content-subtle">{fmt$(p.total_cost)}</td>
 <td className={`text-right text-[14px] font-semibold ${tone(p.gross_margin)}`}>{fmt$(p.gross_margin)}</td>
 <td className={`text-right pr-4 text-[13px] font-semibold tabular-nums ${tone(p.margin_pct)}`}>{p.margin_pct}%</td>
 </tr>
 ))}
 {view === "category" && catPag.paginated.map((c, i) => (
 <tr key={i}>
 <td className="pl-4 font-semibold text-content dark:text-white">{toNameCase(c.category_name)}</td>
 <td className="text-right text-[13px] font-medium text-content dark:text-white">{fmt$(c.revenue)}</td>
 <td className={`text-right text-[14px] font-semibold ${tone(c.gross_margin)}`}>{fmt$(c.gross_margin)}</td>
 <td className={`text-right pr-4 text-[13px] font-semibold tabular-nums ${tone(c.margin_pct)}`}>{c.margin_pct}%</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <Pagination page={activePag.page} totalPages={activePag.totalPages} total={activePag.total} onPage={activePag.setPage} />
 </Card>
 </div>
 )}
 </div>
 );
}
