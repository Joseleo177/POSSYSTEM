import { useState } from "react";
import { api } from "../../services/api";
import { buildMarginsExcel } from "../../helpers/excel";
import {
 fmt$, fmtN,
 useReport, defaultRange,
 DateRangePicker, KpiCard, SectionHeader, Card, Loading, ExportButton,
} from "./reportes.utils";

export default function MarginsReport() {
 const [range, setRange] = useState(defaultRange(30));
 const { data, loading, error } = useReport(api.reports.margins, { date_from: range.from, date_to: range.to }, [range]);
 const [view, setView] = useState("top");
 const s = data?.summary;

 return (
 <div className="h-full flex flex-col space-y-4 overflow-auto">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
 <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
 {data && <ExportButton onClick={() => buildMarginsExcel(data, range)} />}
 </div>

 {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
 {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-wide">{error}</div>}

 {!loading && !error && data && (
 <div className="flex-1 min-h-0 space-y-3 overflow-auto">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <KpiCard label="Retorno de Inversión" value={`${s.avg_margin_pct || 0}%`} icon="" color="text-brand-500" />
 <KpiCard label="Utilidad Bruta" value={fmt$(s.total_margin || 0)} icon="" color="text-green-500" />
 <KpiCard label="Ingresos de Operación" value={fmt$(s.total_revenue || 0)} icon="" color="text-blue-500" />
 <KpiCard label="Costo de Mercancía" value={fmt$(s.total_cost || 0)} icon="" color="text-danger" />
 </div>

 <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide shrink-0">
 {[["top", "Mayor Margen"], ["bottom", "Menor Margen"], ["category", "Categorías"]].map(([k, l]) => (
 <button key={k} onClick={() => setView(k)}
 className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all whitespace-nowrap border
 ${view === k ? "bg-brand-500 text-black border-brand-500" : "bg-surface-3 dark:bg-white/5 border-transparent text-content-muted dark:text-content-dark-muted opacity-60 hover:opacity-100"}`}>
 {l}
 </button>
 ))}
 </div>

 <Card className="!p-0 overflow-auto min-h-0 flex flex-col">
 <div className="p-3 border-b border-border dark:border-white/5">
 <SectionHeader title={view === "top" ? "Alta Rentabilidad" : view === "bottom" ? "Optimización" : "Rentabilidad Sectorizada"}
 sub="Basado en costo de reposición actual" />
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse min-w-[600px]">
 <thead className="bg-surface-2 dark:bg-surface-dark-2/50">
 {view === "top" && (
 <tr className="border-b border-border/40 dark:border-white/5">
 {["Ranking", "Producto", "Ingresos", "Inversión", "Utilidad", "ROI %"].map(h => (
 <th key={h} className={`px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted ${["Ingresos","Inversión","Utilidad"].includes(h) ? "text-right" : h === "ROI %" ? "text-center" : ""}`}>{h}</th>
 ))}
 </tr>
 )}
 {view === "category" && (
 <tr className="border-b border-border/40 dark:border-white/5">
 {["Categoría", "Volumen", "Utilidad", "ROI"].map(h => (
 <th key={h} className={`px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted ${["Volumen","Utilidad"].includes(h) ? "text-right" : h === "ROI" ? "text-center" : ""}`}>{h}</th>
 ))}
 </tr>
 )}
 </thead>
 <tbody className="divide-y divide-border/20 dark:divide-white/5">
 {view === "top" && data.by_product.slice(0, 20).map((p, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2"><div className="w-6 h-6 rounded-lg bg-surface-3 dark:bg-white/5 flex items-center justify-center text-[10px] font-black text-brand-500">{i + 1}</div></td>
 <td className="px-4 py-2">
 <div className="font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{p.product_name}</div>
 <div className="text-[10px] font-bold text-content-subtle opacity-50 uppercase">{p.category_name}</div>
 </td>
 <td className="px-4 py-2 text-right tabular-nums text-[11px] text-content dark:text-white font-black">{fmt$(p.revenue)}</td>
 <td className="px-4 py-2 text-right tabular-nums text-danger text-[11px]">{fmt$(p.total_cost)}</td>
 <td className="px-4 py-2 text-right tabular-nums text-green-500 font-black text-[11px]">{fmt$(p.gross_margin)}</td>
 <td className="px-4 py-2 text-center">
 <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${parseFloat(p.margin_pct) >= 30 ? "text-green-500 bg-green-500/10" : "text-brand-500 bg-brand-500/10"}`}>
 {p.margin_pct}%
 </span>
 </td>
 </tr>
 ))}
 {view === "category" && data.by_category.map((c, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2 font-black text-[11px] uppercase tracking-wider text-brand-500">{c.category_name}</td>
 <td className="px-4 py-2 text-right tabular-nums text-[11px] text-content dark:text-white font-black">{fmt$(c.revenue)}</td>
 <td className="px-4 py-2 text-right tabular-nums text-green-500 font-black text-[11px]">{fmt$(c.gross_margin)}</td>
 <td className="px-4 py-2 text-center">
 <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${parseFloat(c.margin_pct) >= 25 ? "text-green-500 bg-green-500/10" : "text-brand-500 bg-brand-500/10"}`}>
 {c.margin_pct}%
 </span>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 {view === "bottom" && <div className="p-10 text-center text-[11px] font-black uppercase tracking-wide text-content-subtle opacity-20">Análisis Completo en el Excel Estratégico</div>}
 </div>
 </Card>
 </div>
 )}
 </div>
 );
}
