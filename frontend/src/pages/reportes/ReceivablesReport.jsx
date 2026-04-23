import { api } from "../../services/api";
import { buildReceivablesExcel } from "../../helpers/excel";
import {
 fmt$, fmtN, pct,
 useReport, usePagination, Pagination,
 KpiCard, SectionHeader, Card, Loading, ExportButton,
} from "./reportes.utils";

export default function ReceivablesReport() {
 const { data, loading, error } = useReport(api.reports.receivables, {}, []);
 const s = data?.summary;
 const a = data?.aging;
 const custPag = usePagination(data?.by_customer ?? []);

 return (
 <div className="h-full flex flex-col space-y-4 overflow-auto">
 <div className="flex justify-end shrink-0">
 {data && <ExportButton onClick={() => buildReceivablesExcel(data)} />}
 </div>

 {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
 {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-wide">{error}</div>}

 {!loading && !error && data && (
 <div className="flex-1 min-h-0 space-y-3 overflow-auto">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <KpiCard label="Invoices Pendientes" value={fmtN(s.total_invoices || 0)} icon="" color="text-orange-500" />
 <KpiCard label="Saldo en Calle" value={fmt$(s.total_balance || 0)} icon="" color="text-danger" />
 <KpiCard label="Cartera Total" value={fmt$(s.total_billed || 0)} icon="" color="text-blue-500" />
 <KpiCard label="Recuperación" value={`${pct((s.total_billed || 0) - (s.total_balance || 0), s.total_billed || 1)}%`} icon="" color="text-green-500" />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 {[
 { label: "0 – 30 Días", amount: a.d0_30_amount, color: "text-green-500", bg: "bg-green-500/10 border-green-500/20" },
 { label: "31 – 60 Días", amount: a.d31_60_amount, color: "text-brand-500", bg: "bg-brand-500/10 border-brand-500/20" },
 { label: "Crítico +60d", amount: a.d60_plus_amount, color: "text-danger", bg: "bg-danger/10 border-danger/20" },
 ].map(b => (
 <div key={b.label} className={`${b.bg} rounded-xl p-3 border`}>
 <div className="text-[11px] font-black text-content-muted dark:text-content-dark-muted uppercase tracking-wide mb-0.5">{b.label}</div>
 <div className={`text-sm font-black ${b.color} tabular-nums font-display`}>{fmt$(b.amount || 0)}</div>
 </div>
 ))}
 </div>

 <Card className="!p-0 min-h-0 flex flex-col">
 <div className="p-3 border-b border-border dark:border-white/5">
 <SectionHeader title="Antigüedad de Cartera" sub="Gestión de cobranza por cliente" />
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse min-w-[600px]">
 <thead className="bg-surface-2 dark:bg-surface-dark-2/50">
 <tr className="border-b border-border/40 dark:border-white/5">
 {["Cliente", "Facturas", "Saldo Deudor", "Aging"].map((h, i) => (
 <th key={h} className={`px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted ${i === 1 || i === 2 ? "text-right" : i === 3 ? "text-center" : ""}`}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-border/20 dark:divide-white/5">
 {custPag.total === 0
 ? <tr><td colSpan={4} className="px-4 py-16 text-center text-[11px] font-black uppercase tracking-wide text-content-subtle opacity-30">Sin cuentas por cobrar pendientes</td></tr>
 : custPag.paginated.map((c, i) => {
 const daysDiff = Math.floor((Date.now() - new Date(c.oldest_invoice)) / 86400000);
 return (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2">
 <div className="font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{c.customer_name}</div>
 <div className="text-[10px] font-bold text-content-subtle opacity-50 uppercase">{c.phone || "—"}</div>
 </td>
 <td className="px-4 py-2 text-right tabular-nums text-[11px] font-black text-content-muted">{c.invoice_count}</td>
 <td className="px-4 py-2 text-right tabular-nums text-danger font-black text-[11px]">{fmt$(c.balance)}</td>
 <td className="px-4 py-2 text-center">
 <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${daysDiff > 60 ? "text-danger bg-danger/10" : daysDiff > 30 ? "text-brand-500 bg-brand-500/10" : "text-green-500 bg-green-500/10"}`}>
 {daysDiff}D
 </span>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 <Pagination page={custPag.page} totalPages={custPag.totalPages} total={custPag.total} onPage={custPag.setPage} />
 </Card>
 </div>
 )}
 </div>
 );
}
