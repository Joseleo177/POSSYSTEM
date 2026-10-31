import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { buildMarginsExcel } from "../../helpers/excel";
import { fmtDateShort, toNameCase } from "../../helpers";
import { fmtNumber } from "../../helpers/numbers";
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
const fmtPct = (v) => `${fmtNumber(parseFloat(v) || 0, 1)}%`;

// Dos lecturas de la misma ganancia. "Por venta" es la devengada —la del contador—; "Por
// cobro" es la que entró a caja, con la utilidad de cada factura repartida entre sus cobros.
const BASES = [
 { key: "venta", label: "Por venta" },
 { key: "cobro", label: "Por cobro" },
];
const EXPLICA = {
 venta: "Lo vendido en el período, se haya cobrado o no. Cuadra con Facturado del reporte de ventas.",
 cobro: "La ganancia del dinero que entró en el período: cada cobro trae su parte de la utilidad de la factura. Reporte de gestión, no fiscal.",
};

const VIEWS = [
 { key: "top",      label: "Mayor margen", title: "Mayor margen" },
 { key: "bottom",   label: "Menor margen", title: "Menor margen" },
 { key: "category", label: "Categorías",   title: "Por categoría" },
 { key: "nocost",   label: "Sin costo",    title: "Sin costo cargado" },
];

export default function MarginsReport() {
 const [range, setRange] = useState(defaultRange(30));
 const [basis, setBasis] = useState("venta");
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
 const params = { date_from: range.from, date_to: range.to, warehouse_id: warehouseId, basis, ...hr.params };
 const { data, loading, error } = useReport(api.reports.margins, params, [range, warehouseId, basis, hr.key]);
 const exportFull = useExportFull(api.reports.margins, params, (d) => buildMarginsExcel(d, { ...range, ...hr.params }));
 const [view, setView] = useState("top");

 // Con una sola sucursal, "todas" promete un alcance que no existe: la API ya devuelve solo
 // la suya. Mismo criterio que el reporte de inventario.
 const todasLabel = warehouses.length === 1 ? warehouses[0].name : "Todas las sucursales";
 const s = data?.summary;
 const cobro = data?.basis === "cobro";

 const byProductDesc = data?.by_product ?? [];
 const byProductAsc = [...byProductDesc].sort((a, b) => parseFloat(a.margin_pct) - parseFloat(b.margin_pct));
 const topPag = usePagination(byProductDesc);
 const bottomPag = usePagination(byProductAsc);
 const catPag = usePagination(data?.by_category ?? []);
 const noCostPag = usePagination(data?.sin_costo ?? []);

 const handleViewChange = (k) => { setView(k); topPag.setPage(1); bottomPag.setPage(1); catPag.setPage(1); noCostPag.setPage(1); };

 // "Sin costo" solo aparece cuando hay algo que corregir.
 const sinCostoCount = data?.sin_costo?.length ?? 0;
 const views = sinCostoCount ? VIEWS.map(v => v.key === "nocost" ? { ...v, count: sinCostoCount } : v) : VIEWS.filter(v => v.key !== "nocost");
 const vista = views.some(v => v.key === view) ? view : "top";
 const activePag = { top: topPag, bottom: bottomPag, category: catPag, nocost: noCostPag }[vista];
 const productos = vista === "top" || vista === "bottom";

 // El gráfico apila costo + utilidad (+ lo vendido sin costo) = ingreso del día. Un día con
 // pérdida —una exoneración sin cobros— no tiene barra de utilidad que mostrar.
 const dias = (data?.by_day ?? []).map(d => ({ ...d, profit_bar: Math.max(0, d.profit), cost_bar: Math.min(d.cost, d.revenue - d.sin_costo) }));
 const haySinCosto = dias.some(d => d.sin_costo > 0);

 // Del total a la utilidad, renglón por renglón. Los que restan llevan el signo delante.
 const filas = !s ? [] : cobro ? [
  { label: "Cobros del período", value: s.cobrado },
  s.vuelto > 0.004 && { label: "Vuelto entregado", value: s.vuelto, minus: true },
  Math.abs(s.ajustes) > 0.004 && { label: s.ajustes > 0 ? "Saldo a favor aplicado" : "Sobrante que no es de la venta", value: Math.abs(s.ajustes), minus: s.ajustes < 0 },
  { label: "Ingreso cobrado", value: s.total_revenue, sub: true },
  { label: "Costo de lo cobrado", value: s.total_cost - s.forgiven_cost, minus: true },
  s.forgiven_cost > 0.004 && { label: "Mercancía exonerada", value: s.forgiven_cost, minus: true },
  s.sin_costo > 0.004 && { label: "Cobrado sin costo cargado", value: s.sin_costo, minus: true },
  { label: "Utilidad cobrada", value: s.total_margin, strong: true },
 ].filter(Boolean) : [
  { label: "Total vendido", value: s.total_revenue },
  s.sin_costo > 0.004 && { label: "Vendido sin costo cargado", value: s.sin_costo, minus: true },
  { label: "Costo de mercancía", value: s.total_cost, minus: true },
  { label: "Utilidad bruta", value: s.total_margin, strong: true },
 ].filter(Boolean);

 return (
 <div className="lg:h-full flex flex-col space-y-4 lg:overflow-auto">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
 <div className="flex items-center gap-2 flex-wrap">
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

 <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 shrink-0">
 <Segmented value={basis} onChange={setBasis} options={BASES} className="self-start" />
 <p className="text-[12px] text-content-subtle leading-snug">{EXPLICA[basis]}</p>
 </div>

 {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
 {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-red-500/5 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 font-semibold">{error}</div>}

 {!loading && !error && data && (
 <div className="lg:flex-1 lg:min-h-0 space-y-3 lg:overflow-auto">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <KpiCard label={cobro ? "Margen cobrado" : "Margen bruto"} value={fmtPct(s.avg_margin_pct)} sub="Sobre lo que tiene costo" />
 <KpiCard label={cobro ? "Utilidad cobrada" : "Utilidad bruta"} value={fmt$(s.total_margin)} />
 <KpiCard
  label={cobro ? "Ingreso cobrado" : "Total vendido"}
  value={fmt$(s.total_revenue)}
  sub={`${fmtNumber(s.sales_count, 0)} ${cobro ? (s.sales_count === 1 ? "factura cobrada" : "facturas cobradas") : (s.sales_count === 1 ? "venta" : "ventas")}`}
 />
 <KpiCard label={cobro ? "Costo de lo cobrado" : "Costo de mercancía"} value={fmt$(s.total_cost)} />
 </div>

 {/* ── Evolución de rentabilidad por día ── */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
 <Card className="lg:col-span-2">
 <SectionHeader
  title="Flujo de rentabilidad"
  sub={cobro ? "Lo cobrado cada día, dividido en costo y utilidad" : "Lo vendido cada día, dividido en costo y utilidad"}
 />
 {dias.length > 0 ? (
 <>
 {/* Apilado: costo + utilidad = ingreso del día. El costo va en gris —es la parte
     que no se queda— y la utilidad en el color de los gráficos. */}
 <BarChart
  data={dias}
  xKey="day"
  height={180}
  series={[
  { key: "cost_bar",   color: "chart-muted", label: "Costo" },
  { key: "profit_bar", color: "chart",       label: "Utilidad" },
  // Ámbar: pide atención (falta cargar el costo). #f59e0b no sirve, se lee como "chart".
  ...(haySinCosto ? [{ key: "sin_costo", color: "#d97706", label: "Sin costo" }] : []),
  ]}
 />
 {(() => {
 const peak = dias.reduce((a, b) => b.profit > a.profit ? b : a, dias[0]);
 return (
 <Callout label="Mejor día">
  {fmtDateShort(peak.day)} <span className="mx-1.5 text-content-subtle font-normal">·</span> {fmt$(peak.profit)} de utilidad
 </Callout>
 );
 })()}
 </>
 ) : (
 <div className="h-[180px] flex items-center justify-center text-[13px] text-content-subtle">
  {cobro ? "Sin cobros en el período" : "Sin ventas en el período"}
 </div>
 )}
 </Card>

 <Card>
 <SectionHeader title="Resumen del período" sub={cobro ? "Del dinero que entró a la utilidad" : "De lo vendido a la utilidad"} />
 <div>
 {filas.map(row => (
 <div key={row.label} className={`flex justify-between items-center gap-3 py-2.5 border-b border-border/60 dark:border-white/[0.06] last:border-0 ${row.strong ? "pt-3" : ""}`}>
 <span className={`text-[13px] ${row.strong || row.sub ? "font-semibold text-content dark:text-white" : "text-content-subtle"}`}>{row.label}</span>
 <span className={`tabular-nums whitespace-nowrap ${row.strong ? "text-[15px] font-bold" : "text-[13px] font-medium"} ${tone(row.value, row.minus ? "text-content-muted" : "text-content dark:text-white")}`}>
 {row.minus && <span className="text-content-subtle mr-1">−</span>}{fmt$(row.value)}
 </span>
 </div>
 ))}
 </div>
 {cobro && s.pending?.count > 0 ? (
 <Callout label={`Ganancia por cobrar · ${s.pending.count} ${s.pending.count === 1 ? "factura" : "facturas"}`}>
  {fmt$(s.pending.profit)} <span className="text-content-subtle font-normal">de {fmt$(s.pending.amount)}</span>
 </Callout>
 ) : (
 <Callout label={cobro ? "Por cada Ref. 100 cobrados" : "Por cada Ref. 100 vendidos"}>
  Ref. {fmtNumber(s.avg_margin_pct, 1)} de ganancia
 </Callout>
 )}
 </Card>
 </div>

 <Segmented value={vista} onChange={handleViewChange} options={views} className="max-w-full overflow-x-auto" />

 <Card className="!p-0 min-h-0 flex flex-col overflow-hidden">
 <div className="px-4 pt-4">
 <SectionHeader
  title={views.find(v => v.key === vista)?.title}
  sub={vista === "nocost"
   ? "Su ingreso no cuenta como ganancia hasta que cargues el costo del producto"
   : cobro
    ? "La parte cobrada de cada producto en el período"
    : "Con el costo al momento de cada venta y el descuento de la factura repartido"}
 />
 </div>

 {/* Teléfono: dos renglones por fila, nombre y utilidad arriba, categoría y margen abajo. */}
 <div className="lg:hidden divide-y divide-border/60 dark:divide-white/[0.06] border-t border-border/60 dark:border-white/[0.06]">
 {activePag.paginated.length === 0 && <div className="px-4 py-12 text-center text-[13px] text-content-subtle">Nada en el período</div>}
 {activePag.paginated.map((r, i) => {
 const nombre = vista === "category" ? toNameCase(r.category_name) : r.product_name;
 const cifra = vista === "nocost" ? r.revenue : r.gross_margin;
 return (
 <div key={i} className="px-4 py-3">
 <div className="flex items-baseline justify-between gap-3">
  <span className="text-[13px] font-semibold text-content dark:text-white truncate">{nombre}</span>
  <span className={`text-[14px] font-semibold tabular-nums whitespace-nowrap ${tone(cifra)}`}>{fmt$(cifra)}</span>
 </div>
 <div className="flex items-baseline justify-between gap-3 mt-0.5 text-[12px] text-content-subtle">
  <span className="truncate">{vista === "category" ? `${r.product_count} productos` : toNameCase(r.category_name)}</span>
  <span className="tabular-nums whitespace-nowrap">
   {vista === "nocost" ? `${r.sales_count} ${r.sales_count === 1 ? "venta" : "ventas"}` : `${fmt$(r.revenue)} · ${fmtPct(r.margin_pct)}`}
  </span>
 </div>
 </div>
 );
 })}
 </div>

 <div className="hidden lg:block overflow-x-auto">
 <table className="table-ledger min-w-[640px]">
 <thead>
 {productos && (
 <tr>
 <th className="pl-4 w-16">#</th>
 <th>Producto</th>
 <th className="text-right">Ingresos</th>
 <th className="text-right">Costo</th>
 <th className="text-right">Utilidad</th>
 <th className="text-right pr-4">Margen</th>
 </tr>
 )}
 {vista === "category" && (
 <tr>
 <th className="pl-4">Categoría</th>
 <th className="text-right">Ingresos</th>
 <th className="text-right">Utilidad</th>
 <th className="text-right pr-4">Margen</th>
 </tr>
 )}
 {vista === "nocost" && (
 <tr>
 <th className="pl-4">Producto</th>
 <th className="text-right">Ventas</th>
 <th className="text-right pr-4">Ingresos</th>
 </tr>
 )}
 </thead>
 <tbody>
 {productos && activePag.paginated.map((p, i) => (
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
 <td className={`text-right pr-4 text-[13px] font-semibold tabular-nums ${tone(p.margin_pct)}`}>{fmtPct(p.margin_pct)}</td>
 </tr>
 ))}
 {vista === "category" && catPag.paginated.map((c, i) => (
 <tr key={i}>
 <td className="pl-4 font-semibold text-content dark:text-white">{toNameCase(c.category_name)}</td>
 <td className="text-right text-[13px] font-medium text-content dark:text-white">{fmt$(c.revenue)}</td>
 <td className={`text-right text-[14px] font-semibold ${tone(c.gross_margin)}`}>{fmt$(c.gross_margin)}</td>
 <td className={`text-right pr-4 text-[13px] font-semibold tabular-nums ${tone(c.margin_pct)}`}>{fmtPct(c.margin_pct)}</td>
 </tr>
 ))}
 {vista === "nocost" && noCostPag.paginated.map((p, i) => (
 <tr key={i}>
 <td className="pl-4 max-w-0">
 <div className="font-semibold text-content dark:text-white truncate">{p.product_name}</div>
 <div className="text-[12px] text-content-subtle truncate">{toNameCase(p.category_name)}</div>
 </td>
 <td className="text-right text-[13px] text-content-subtle tabular-nums">{fmtNumber(p.sales_count, 0)}</td>
 <td className="text-right pr-4 text-[13px] font-medium text-content dark:text-white">{fmt$(p.revenue)}</td>
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
