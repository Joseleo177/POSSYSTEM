import { useState, useEffect, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import SaleDetailModal from "../../components/Customers/SaleDetailModal";
import CustomSelect from "../../components/ui/CustomSelect";
import { fmtDate } from "../../helpers";
import {
 fmt$,
 SectionHeader, Loading, usePagination, Pagination,
} from "./reportes.utils";

export default function CashSessionsReport() {
 const { notify } = useApp();
 const [sessions, setSessions] = useState([]);
 const [loading, setLoading] = useState(false);
 const [selectedSession, setSelectedSession] = useState(null);
 const [summaryData, setSummaryData] = useState(null);
 const [loadingSummary, setLoadingSummary] = useState(false);
 const [detailSaleId, setDetailSaleId] = useState(null);

 // Filtros
 const [searchTerm, setSearchTerm] = useState("");
 const [filterEmployee, setFilterEmployee] = useState("");
 const [dateFrom, setDateFrom] = useState("");
 const [dateTo, setDateTo] = useState("");

 const employees = [...new Set(sessions.map(s => s.employee?.full_name).filter(Boolean))];

 const filtered = sessions.filter(s => {
 if (filterEmployee && s.employee?.full_name !== filterEmployee) return false;
 if (dateFrom && new Date(s.closed_at) < new Date(dateFrom + "T00:00:00")) return false;
 if (dateTo && new Date(s.closed_at) > new Date(dateTo + "T23:59:59")) return false;
 if (searchTerm.trim()) {
 const q = searchTerm.trim().toLowerCase();
 const hay = `cierre #${s.id} ${s.employee?.full_name || ""} ${s.warehouse?.name || ""}`.toLowerCase();
 if (!hay.includes(q)) return false;
 }
 return true;
 });

 const sessionsPag = usePagination(filtered, 20);

 // Volver a página 1 al cambiar filtros
 useEffect(() => { sessionsPag.setPage(1); }, [searchTerm, filterEmployee, dateFrom, dateTo]); // eslint-disable-line

 const hasFilters = !!(searchTerm || filterEmployee || dateFrom || dateTo);
 const clearFilters = () => { setSearchTerm(""); setFilterEmployee(""); setDateFrom(""); setDateTo(""); };

 const loadSessions = useCallback(async () => {
 setLoading(true);
 try {
 const r = await api.cashSessions.history({});
 setSessions(r.data);
 } catch (e) {
 console.error(e);
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => { loadSessions(); }, [loadSessions]);

 const viewSummary = async (session) => {
 setSelectedSession(session);
 setLoadingSummary(true);
 try {
 const r = await api.cashSessions.summary(session.id);
 setSummaryData(r.data);
 } catch (e) {
 console.error(e);
 } finally {
 setLoadingSummary(false);
 }
 };


 return (
 <div className="h-full flex flex-col space-y-3 overflow-auto">
 <div className="shrink-0 flex flex-wrap items-center gap-2">
 {/* Buscador */}
 <div className="relative flex-1 min-w-[200px] group">
 <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle opacity-40 group-focus-within:opacity-100 group-focus-within:text-brand-500 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
 </svg>
 <input
 type="text"
 placeholder="Buscar por # cierre, cajero o almacén..."
 value={searchTerm}
 onChange={e => setSearchTerm(e.target.value)}
 className="w-full h-10 pl-10 pr-4 bg-surface-2 dark:bg-white/[0.03] border border-border/40 dark:border-white/5 rounded-xl text-[11px] font-bold tracking-wide focus:border-brand-500/50 focus:ring-4 focus:ring-brand-500/5 outline-none transition-all placeholder:text-content-subtle/50"
 />
 </div>

 {/* Cajero */}
 <CustomSelect
 value={filterEmployee}
 onChange={setFilterEmployee}
 placeholder="TODOS LOS CAJEROS"
 className="w-48"
 options={[
 { value: "", label: "TODOS LOS CAJEROS" },
 ...employees.map(name => ({ value: name, label: name })),
 ]}
 />

 {/* Rango de fechas */}
 <div className="flex items-center gap-1.5">
 <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
 className="h-10 px-3 bg-surface-2 dark:bg-white/[0.03] border border-border/40 dark:border-white/5 rounded-xl text-[11px] font-bold focus:border-brand-500/50 outline-none transition-all" />
 <span className="text-[10px] font-black text-content-subtle opacity-40">→</span>
 <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
 className="h-10 px-3 bg-surface-2 dark:bg-white/[0.03] border border-border/40 dark:border-white/5 rounded-xl text-[11px] font-bold focus:border-brand-500/50 outline-none transition-all" />
 </div>

 {/* Limpiar filtros */}
 {hasFilters && (
 <button onClick={clearFilters}
 className="h-10 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-danger border border-danger/20 hover:bg-danger/10 transition-all">
 Limpiar
 </button>
 )}

 {/* Refrescar */}
 <button onClick={loadSessions}
 className="h-10 w-10 flex items-center justify-center rounded-xl bg-surface-3 dark:bg-white/5 border border-border dark:border-white/5 hover:bg-brand-500/10 text-content-subtle hover:text-brand-500 transition-all">
 <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
 </svg>
 </button>
 </div>

 <div className="flex-1 min-h-0 bg-white dark:bg-white/[0.02] rounded-xl border border-border dark:border-white/5 flex flex-col">
 <div className="overflow-x-auto flex-1 scrollbar-hide">
 <table className="w-full text-left border-collapse min-w-[700px]">
 <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-border dark:border-white/5">
 <tr>
 {["ID / Fecha", "Cajero", "Almacén", "Duración", "Acciones"].map((h, i) => (
 <th key={h} className={`px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted ${i === 3 ? "text-center" : i === 4 ? "text-right" : ""}`}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-border/20 dark:divide-white/5">
 {loading ? (
 <tr><td colSpan="5" className="p-10 text-center"><Loading /></td></tr>
 ) : sessionsPag.total > 0 ? (
 sessionsPag.paginated.map((s) => (
 <tr key={s.id} className="group hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2.5">
 <div className="text-[11px] font-black text-content dark:text-white group-hover:text-brand-500 transition-colors">CIERRE #{s.id}</div>
 <div className="text-[10px] font-bold text-content-subtle opacity-60 mt-0.5 uppercase">{fmtDate(s.closed_at)}</div>
 </td>
 <td className="px-4 py-2.5">
 <div className="text-[11px] font-black uppercase text-content dark:text-white tracking-tight">{s.employee?.full_name}</div>
 </td>
 <td className="px-4 py-2.5">
 <span className="text-[11px] font-black text-brand-500 uppercase tracking-wide">{s.warehouse?.name}</span>
 </td>
 <td className="px-4 py-2.5 text-center">
 <div className="text-[11px] font-black tabular-nums text-content-muted">
 {Math.floor((new Date(s.closed_at) - new Date(s.opened_at)) / 3600000)}H {Math.floor(((new Date(s.closed_at) - new Date(s.opened_at)) % 3600000) / 60000)}M
 </div>
 </td>
 <td className="px-4 py-2.5 text-right">
 <button onClick={() => viewSummary(s)}
 className="px-3 py-1 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-brand-500 hover:text-black transition-all active:scale-95">
 Resumen
 </button>
 </td>
 </tr>
 ))
 ) : (
 <tr><td colSpan="5" className="p-10 text-center text-[11px] text-content-subtle opacity-30 uppercase font-black tracking-wide">{hasFilters ? "Sin resultados con estos filtros" : "Sin sesiones"}</td></tr>
 )}
 </tbody>
 </table>
 </div>
 <Pagination page={sessionsPag.page} totalPages={sessionsPag.totalPages} total={sessionsPag.total} onPage={sessionsPag.setPage} />
 </div>

 {selectedSession && (
 <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
 <div className="bg-white dark:bg-surface-dark-2 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] border border-border dark:border-white/5">

 {/* Header */}
 <div className="shrink-0 px-5 py-4 border-b border-border dark:border-white/5 flex items-center justify-between bg-surface-2 dark:bg-white/5 rounded-t-2xl">
 <div>
 <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-0.5">RESUMEN DE CAJA</div>
 <h3 className="text-sm font-black text-content dark:text-white uppercase tracking-tight">#{selectedSession.id} — {selectedSession.warehouse?.name}</h3>
 </div>
 <button onClick={() => { setSelectedSession(null); setSummaryData(null); }}
 className="w-8 h-8 rounded-full bg-surface-3 dark:bg-white/10 flex items-center justify-center hover:bg-danger hover:text-white text-content-muted transition-all">✕</button>
 </div>

 {/* Body scrollable */}
 <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
 {loadingSummary ? (
 <Loading />
 ) : summaryData ? (
 <div className="space-y-5">

 {/* KPIs */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 {[
 { label: "Total Venta", value: fmt$(summaryData.sales.total_sales), color: "text-brand-500", sub: `${summaryData.sales.sale_count} rec.` },
 { label: "Recibido", value: fmt$(summaryData.sales.total_paid), color: "text-success", sub: `${summaryData.sales.paid_count} items` },
 { label: "Pendiente", value: fmt$(summaryData.sales.total_pending), color: "text-warning", sub: `${summaryData.sales.pending_count} items` },
 { label: "Turno", value: `${new Date(selectedSession.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} / ${new Date(selectedSession.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, color: "text-content dark:text-white", sub: "" },
 ].map(item => (
 <div key={item.label} className="p-3 bg-surface-2 dark:bg-white/5 rounded-xl border border-border/20 dark:border-white/5 text-center">
 <div className="text-[10px] font-black text-content-muted uppercase tracking-wide mb-1">{item.label}</div>
 <div className={`text-sm font-black ${item.color}`}>{item.value}</div>
 {item.sub && <div className="text-[10px] font-bold text-content-subtle opacity-50 uppercase mt-0.5">{item.sub}</div>}
 </div>
 ))}
 </div>

 {/* Ventas del turno */}
 <div className="space-y-2">
 <SectionHeader title="Listado de Ventas del Turno" sub="Auditoría granular de transacciones" />
 <div className="rounded-xl border border-border dark:border-white/5 overflow-hidden">
 <table className="w-full text-left">
 <thead className="bg-surface-2 dark:bg-white/5">
 <tr>
 {["ID / Cliente", "Estado", "Monto", "Hora", "Detalle"].map((h, i) => (
 <th key={h} className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-content-muted ${i === 1 || i === 3 ? "text-center" : i === 2 || i === 4 ? "text-right" : ""}`}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-border/10 dark:divide-white/5">
 {summaryData.sales_list?.length > 0 ? (
 summaryData.sales_list.map((sale, sIdx) => (
 <tr key={sIdx} className="hover:bg-surface-2/50 dark:hover:bg-white/[0.03] transition-colors">
 <td className="px-4 py-2.5">
 <div className="text-[11px] font-black uppercase tabular-nums text-content dark:text-white">{sale.invoice_number || `#${sale.id}`}</div>
 <div className="text-[10px] font-bold text-content-subtle opacity-60">{sale.customer_name || "Venta Casual"}</div>
 </td>
 <td className="px-4 py-2.5 text-center">
 <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${(sale.status?.toLowerCase() === 'pagada' || sale.status?.toLowerCase() === 'pagado') ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
 {sale.status}
 </span>
 </td>
 <td className="px-4 py-2.5 text-right">
 <div className="text-[11px] font-black text-success tabular-nums">{fmt$(sale.total)}</div>
 </td>
 <td className="px-4 py-2.5 text-center">
 <div className="text-[10px] font-bold text-content-subtle tabular-nums">{new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
 </td>
 <td className="px-4 py-2.5 text-right">
 <button onClick={() => setDetailSaleId(sale.id)}
 className="p-1.5 rounded-lg bg-surface-3 dark:bg-white/10 text-content-subtle hover:text-brand-500 hover:bg-brand-500/10 transition-colors" title="Ver detalle">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
 </svg>
 </button>
 </td>
 </tr>
 ))
 ) : (
 <tr><td colSpan="5" className="p-5 text-center text-[11px] font-black uppercase tracking-wide text-content-subtle opacity-30">No se registraron ventas en este turno</td></tr>
 )}
 </tbody>
 </table>
 </div>
 </div>

 {/* Conciliación */}
 <div className="space-y-2">
 <SectionHeader title="Conciliación por Diario" sub="Comparativa entre monto esperado y declarado" />
 <div className="rounded-xl border border-border dark:border-white/5 overflow-hidden">
 <table className="w-full text-left">
 <thead className="bg-surface-2 dark:bg-white/5">
 <tr>
 {["Diario", "Inicio", "Ventas", "Cambio", "Esperado", "Declarado", "Dif."].map((h, i) => (
 <th key={h} className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-content-muted ${i >= 1 && i <= 5 ? "text-right" : i === 6 ? "text-center" : ""}`}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-border/10 dark:divide-white/5">
 {summaryData.journal_summary.map((js, idx) => (
 <tr key={idx} className="text-[11px] font-black text-content dark:text-white">
 <td className="px-4 py-2.5 flex items-center gap-2.5">
 <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: js.journal_color }} />
 {js.journal_name}
 </td>
 <td className="px-4 py-2.5 text-right text-content-subtle tabular-nums">{js.opening_amount.toFixed(2)}</td>
 <td className="px-4 py-2.5 text-right text-brand-500 tabular-nums">+{js.cash_in.toFixed(2)}</td>
 <td className="px-4 py-2.5 text-right tabular-nums">
 {(js.change_out || 0) > 0
  ? <span className="text-danger">−{(js.change_out).toFixed(2)}</span>
  : <span className="text-content-subtle opacity-30">—</span>}
 </td>
 <td className="px-4 py-2.5 text-right tabular-nums">{js.expected_amount.toFixed(2)}</td>
 <td className="px-4 py-2.5 text-right text-success tabular-nums">{js.closing_amount?.toFixed(2) || "0.00"}</td>
 <td className={`px-4 py-2.5 text-center tabular-nums ${(js.difference || 0) < 0 ? "text-danger" : (js.difference || 0) > 0 ? "text-success" : "text-content-subtle opacity-40"}`}>
 {(js.difference || 0) === 0 ? "OK" : (js.difference || 0).toFixed(2)}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 </div>
 ) : null}
 </div>

 {/* Footer */}
 <div className="shrink-0 px-5 py-3 bg-surface-2 dark:bg-white/5 border-t border-border dark:border-white/5 flex justify-end rounded-b-2xl">
 <button onClick={() => { setSelectedSession(null); setSummaryData(null); }}
 className="px-6 py-2 bg-surface-3 dark:bg-white/10 rounded-xl text-[11px] font-black uppercase tracking-wide text-content dark:text-white hover:bg-danger/10 hover:text-danger transition-all border border-border dark:border-white/5">
 Cerrar
 </button>
 </div>
 </div>
 </div>
 )}

 {detailSaleId && (
 <SaleDetailModal saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />
 )}
 </div>
 );
}
