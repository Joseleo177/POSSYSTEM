import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { buildCustomersExcel } from "../../helpers/excel";
import CustomSelect from "../../components/ui/CustomSelect";
import {
 fmt$, fmtN, pct,
 useReport, defaultRange, Pagination, useExportFull,
 DateRangePicker, KpiCard, SectionHeader, Card, Loading, ExportButton,
} from "./reportes.utils";

export default function CustomersReport() {
 const [range, setRange] = useState(defaultRange(30));
 const [inactiveDays, setInactiveDays] = useState(45);
 const [view, setView] = useState("top");
 // Paginación en el servidor, no sobre lo ya recibido: el reporte traía un top recortado y
 // el resto de los clientes era inalcanzable. La página viaja como offset, así que cambiarla
 // pide datos nuevos. Al cambiar de pestaña vuelve a la primera.
 const PAGE_SIZE = 25;
 const [page, setPage] = useState(1);

 // Consumo por sucursal: un cliente puede comprar en varias, y mezclarlas hace que el ranking
 // de una tienda se infle con lo que compró en otra.
 const [warehouseId, setWarehouseId] = useState("");
 const [warehouses, setWarehouses] = useState([]);
 useEffect(() => {
  api.warehouses.getAll()
   .then(r => setWarehouses((r.data || []).filter(w => w.sells !== false)))
   .catch(e => console.error("[CustomersReport] no se pudieron cargar los almacenes:", e));
 }, []);
 const todasLabel = warehouses.length === 1 ? warehouses[0].name : "TODAS LAS SUCURSALES";

 const params = {
   date_from: range.from, date_to: range.to, inactive_days: inactiveDays, warehouse_id: warehouseId,
   limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
 };
 const { data, loading, error } = useReport(api.reports.customersAnalysis, params, [range, inactiveDays, warehouseId, page]);
 // El export pide el dataset completo aparte, así que va sin limit ni offset.
 const exportFull = useExportFull(api.reports.customersAnalysis, { date_from: range.from, date_to: range.to, inactive_days: inactiveDays, warehouse_id: warehouseId }, (d) => buildCustomersExcel(d, range));
 const rr = data?.repeat_rate;

 const totalFor = { top: data?.totals?.top ?? 0, inactive: data?.totals?.inactive ?? 0, new: data?.totals?.new ?? 0 };
 const currentTotal = totalFor[view] || 0;
 const totalPages = Math.max(1, Math.ceil(currentTotal / PAGE_SIZE));

 const handleViewChange = (k) => {
  setView(k);
  setPage(1);
 };

 return (
 <div className="h-full flex flex-col space-y-4 overflow-auto">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
 <div className="flex items-center gap-2 flex-wrap">
 <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
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
 </div>
 {data && <ExportButton onClick={exportFull.run} loading={exportFull.exporting} />}
 </div>

 {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
 {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-wide">{error}</div>}

 {!loading && !error && data && (
 <div className="flex-1 min-h-0 space-y-3 overflow-auto">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 {/* Los KPI salen de totals y no del largo de los arrays: ahora esos arrays son una página
     de 25, así que contarlos daría 25 en cuanto haya más clientes que eso. */}
 <KpiCard label="Nuevos Clientes" value={fmtN(totalFor.new)} icon="" color="text-brand-500" />
 <KpiCard label="Clientes Inactivos" value={fmtN(totalFor.inactive)} icon="" color="text-danger" sub={`>${inactiveDays}d`} />
 <KpiCard label="Tasa Recurrencia" value={rr?.identified_customers > 0 ? `${pct(rr.repeat_customers, rr.identified_customers)}%` : "—"} icon="" color="text-blue-500" />
 <KpiCard label="Crecimiento" value={`+${pct(totalFor.new, (rr?.identified_customers || 1))}%`} icon="" color="text-green-500" />
 </div>

 <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide shrink-0">
 {[["top", "Rank Elite"], ["inactive", "Reactivar"], ["new", "Nuevos"], ["ticket", "Segmentación"]].map(([k, l]) => (
 <button key={k} onClick={() => handleViewChange(k)}
 className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all whitespace-nowrap border
 ${view === k ? "bg-brand-500 text-black border-brand-500" : "bg-surface-3 dark:bg-white/5 border-transparent text-content-muted dark:text-content-dark-muted opacity-60 hover:opacity-100"}`}>
 {l}
 </button>
 ))}
 </div>

 <Card className="!p-0 min-h-0 flex flex-col">
 <div className="p-3 border-b border-border dark:border-white/5">
 <SectionHeader
 title={view === "top" ? "Ranking Elite" : view === "inactive" ? "Campaña Reactivación" : view === "new" ? "Nuevos Prospectos" : "Segmentación"}
 sub="Métricas de consumo y perfiles de fidelidad" />
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse min-w-[600px]">
 <thead className="bg-surface-2 dark:bg-surface-dark-2/50">
 {view === "top" && (
 <tr className="border-b border-border/40 dark:border-white/5">
 {["Cliente", "Compras", "Promedio", "Total Invertido", "Última"].map((h, i) => (
 <th key={h} className={`px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted ${i >= 1 && i <= 3 ? "text-right" : i === 4 ? "text-center" : ""}`}>{h}</th>
 ))}
 </tr>
 )}
 {view === "inactive" && (
 <tr className="border-b border-border/40 dark:border-white/5">
 {["Cliente", "Valor Histórico", "Inactividad"].map((h, i) => (
 <th key={h} className={`px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted ${i === 1 ? "text-right" : i === 2 ? "text-center" : ""}`}>{h}</th>
 ))}
 </tr>
 )}
 {view === "new" && (
 <tr className="border-b border-border/40 dark:border-white/5">
 {["Cliente", "Teléfono", "1ra Compra", "Compras", "Total"].map((h, i) => (
 <th key={h} className={`px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted ${i >= 2 ? "text-right" : ""}`}>{h}</th>
 ))}
 </tr>
 )}
 {view === "ticket" && (
 <tr className="border-b border-border/40 dark:border-white/5">
 {["Rango de Ticket", "Transacciones", "Ingresos", "% Total"].map((h, i) => (
 <th key={h} className={`px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted ${i >= 1 ? "text-right" : ""}`}>{h}</th>
 ))}
 </tr>
 )}
 </thead>
 <tbody className="divide-y divide-border/20 dark:divide-white/5">
 {view === "top" && (data?.top_customers ?? []).map((c, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2">
 <div className="font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{c.name}</div>
 <div className="text-[10px] font-bold text-content-subtle uppercase">{c.phone || "Sin contacto"}</div>
 </td>
 <td className="px-4 py-2 text-right tabular-nums text-[11px] font-black text-content-muted">{c.purchase_count}</td>
 <td className="px-4 py-2 text-right tabular-nums text-[11px] text-content-subtle">{fmt$(c.avg_ticket)}</td>
 <td className="px-4 py-2 text-right tabular-nums text-green-500 font-black text-[11px]">{fmt$(c.total_spent)}</td>
 <td className="px-4 py-2 text-center text-[11px] font-black text-content-subtle uppercase">{new Date(c.last_purchase).toLocaleDateString("es-VE")}</td>
 </tr>
 ))}
 {view === "inactive" && (data?.inactive_customers ?? []).map((c, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2">
 <div className="font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{c.name}</div>
 <div className="text-[10px] font-bold text-content-subtle uppercase">{c.phone || "Sin contacto"}</div>
 </td>
 <td className="px-4 py-2 text-right tabular-nums text-brand-500 font-black text-[11px]">{fmt$(c.lifetime_value)}</td>
 <td className="px-4 py-2 text-center">
 <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${c.days_inactive > 60 ? "bg-danger/10 text-danger" : "bg-brand-500/10 text-brand-500"}`}>
 {c.days_inactive}D
 </span>
 </td>
 </tr>
 ))}
 {view === "new" && (data.new_customers.length === 0
 ? <tr><td colSpan={5} className="px-4 py-16 text-center text-[11px] font-black uppercase tracking-wide text-content-subtle">Sin clientes nuevos en este período</td></tr>
 : (data?.new_customers ?? []).map((c, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2 font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{c.name}</td>
 <td className="px-4 py-2 text-[11px] text-content-subtle">{c.phone || "—"}</td>
 <td className="px-4 py-2 text-right text-[11px] font-black text-content-subtle tabular-nums">{new Date(c.first_purchase).toLocaleDateString("es-VE")}</td>
 <td className="px-4 py-2 text-right tabular-nums text-[11px] font-black text-brand-500">{c.purchase_count}</td>
 <td className="px-4 py-2 text-right tabular-nums text-green-500 font-black text-[11px]">{fmt$(c.total_spent)}</td>
 </tr>
 )))}
 {view === "ticket" && (() => {
 const totalRev = data.ticket_distribution.reduce((s, r) => s + r.revenue, 0);
 return data.ticket_distribution.length === 0
 ? <tr><td colSpan={4} className="px-4 py-16 text-center text-[11px] font-black uppercase tracking-wide text-content-subtle">Sin datos de distribución</td></tr>
 : data.ticket_distribution.map((t, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2 font-black text-[11px] uppercase tracking-wider text-brand-500">{t.range}</td>
 <td className="px-4 py-2 text-right tabular-nums text-[11px] font-black text-content dark:text-white">{t.count}</td>
 <td className="px-4 py-2 text-right tabular-nums text-green-500 font-black text-[11px]">{fmt$(t.revenue)}</td>
 <td className="px-4 py-2 text-right tabular-nums text-[11px] font-black text-content-subtle">{pct(t.revenue, totalRev)}%</td>
 </tr>
 ));
 })()}
 </tbody>
 </table>
 </div>
 {/* Un solo paginador: el total sale de la vista activa y el backend responde esa página.
     "Segmentación" no lista clientes, así que no lo lleva. */}
 {view !== "ticket" && <Pagination page={page} totalPages={totalPages} total={currentTotal} onPage={setPage} />}
 </Card>
 </div>
 )}
 </div>
 );
}
