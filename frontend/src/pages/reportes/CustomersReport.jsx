import { useState } from "react";
import { api } from "../../services/api";
import { buildCustomersExcel } from "../../helpers/excel";
import {
 fmt$, fmtN, pct,
 useReport, defaultRange,
 DateRangePicker, KpiCard, SectionHeader, Card, Loading, ExportButton,
} from "./reportes.utils";

export default function CustomersReport() {
 const [range, setRange] = useState(defaultRange(30));
 const [inactiveDays, setInactiveDays] = useState(45);
 const { data, loading, error } = useReport(api.reports.customersAnalysis, { date_from: range.from, date_to: range.to, inactive_days: inactiveDays }, [range, inactiveDays]);
 const [view, setView] = useState("top");
 const rr = data?.repeat_rate;

 return (
 <div className="h-full flex flex-col space-y-4 overflow-auto">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
 <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
 {data && <ExportButton onClick={() => buildCustomersExcel(data, range)} />}
 </div>

 {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
 {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-wide">{error}</div>}

 {!loading && !error && data && (
 <div className="flex-1 min-h-0 space-y-3 overflow-auto">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <KpiCard label="Nuevos Clientes" value={fmtN(data.new_customers.length)} icon="" color="text-brand-500" />
 <KpiCard label="Clientes Inactivos" value={fmtN(data.inactive_customers.length)} icon="" color="text-danger" sub={`>${inactiveDays}d`} />
 <KpiCard label="Tasa Recurrencia" value={rr?.identified_customers > 0 ? `${pct(rr.repeat_customers, rr.identified_customers)}%` : "—"} icon="" color="text-blue-500" />
 <KpiCard label="Crecimiento" value={`+${pct(data.new_customers.length, (rr?.identified_customers || 1))}%`} icon="" color="text-green-500" />
 </div>

 <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide shrink-0">
 {[["top", "Rank Elite"], ["inactive", "Reactivar"], ["new", "Nuevos"], ["ticket", "Segmentación"]].map(([k, l]) => (
 <button key={k} onClick={() => setView(k)}
 className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all whitespace-nowrap border
 ${view === k ? "bg-brand-500 text-black border-brand-500" : "bg-surface-3 dark:bg-white/5 border-transparent text-content-muted dark:text-content-dark-muted opacity-60 hover:opacity-100"}`}>
 {l}
 </button>
 ))}
 </div>

 <Card className="!p-0 overflow-auto min-h-0 flex flex-col">
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
 </thead>
 <tbody className="divide-y divide-border/20 dark:divide-white/5">
 {view === "top" && data.top_customers.map((c, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2">
 <div className="font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{c.name}</div>
 <div className="text-[10px] font-bold text-content-subtle opacity-50 uppercase">{c.phone || "Sin contacto"}</div>
 </td>
 <td className="px-4 py-2 text-right tabular-nums text-[11px] font-black text-content-muted">{c.purchase_count}</td>
 <td className="px-4 py-2 text-right tabular-nums text-[11px] text-content-subtle">{fmt$(c.avg_ticket)}</td>
 <td className="px-4 py-2 text-right tabular-nums text-green-500 font-black text-[11px]">{fmt$(c.total_spent)}</td>
 <td className="px-4 py-2 text-center text-[11px] font-black text-content-subtle uppercase">{new Date(c.last_purchase).toLocaleDateString("es-VE")}</td>
 </tr>
 ))}
 {view === "inactive" && data.inactive_customers.map((c, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2">
 <div className="font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{c.name}</div>
 <div className="text-[10px] font-bold text-content-subtle opacity-50 uppercase">{c.phone || "Sin contacto"}</div>
 </td>
 <td className="px-4 py-2 text-right tabular-nums text-brand-500 font-black text-[11px]">{fmt$(c.lifetime_value)}</td>
 <td className="px-4 py-2 text-center">
 <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${c.days_inactive > 60 ? "bg-danger/10 text-danger" : "bg-brand-500/10 text-brand-500"}`}>
 {c.days_inactive}D
 </span>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 {(view === "new" || view === "ticket") && <div className="p-10 text-center text-[11px] font-black uppercase tracking-wide text-content-subtle opacity-20">Segmentación Completa en Reporte Maestro</div>}
 </div>
 </Card>
 </div>
 )}
 </div>
 );
}
