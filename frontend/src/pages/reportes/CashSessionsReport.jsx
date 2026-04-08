import { useState, useEffect, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import ReceiptModal from "../../components/ReceiptModal";
import { fmtDate } from "../../helpers";
import {
  fmt$,
  SectionHeader, Loading,
} from "./reportes.utils";

export default function CashSessionsReport() {
  const { notify } = useApp();
  const [limit, setLimit] = useState(50);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [receiptSale, setReceiptSale] = useState(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.cashSessions.history({ limit });
      setSessions(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [limit]);

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

  const openReceipt = async (saleId) => {
    setLoadingReceipt(true);
    try {
      const r = await api.sales.getOne(saleId);
      if (r.ok && r.data) setReceiptSale(r.data);
      else notify("No se encontró la data de la venta", "err");
    } catch (e) {
      notify("Error al cargar venta: " + e.message, "err");
    } finally {
      setLoadingReceipt(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-3 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-1 shrink-0">
        <div className="text-[9px] font-black text-content-muted dark:text-content-subtle uppercase tracking-[3px]">Historial de Cierres Recientes</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-surface-3 dark:bg-white/5 px-2 py-1 rounded-lg border border-border dark:border-white/5">
            <span className="text-[8px] font-black text-content-subtle uppercase">Límite</span>
            <select value={limit} onChange={e => setLimit(e.target.value)}
              className="bg-transparent border-none text-[9px] font-black focus:ring-0 cursor-pointer p-0 pr-4 text-content dark:text-white">
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          <button onClick={loadSessions}
            className="p-1.5 rounded-lg bg-surface-3 dark:bg-white/5 border border-border dark:border-white/5 hover:bg-brand-500/10 text-content-subtle hover:text-brand-500 transition-all">
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-white dark:bg-white/[0.02] rounded-xl border border-border dark:border-white/5 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1 scrollbar-hide">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-border dark:border-white/5">
              <tr>
                {["ID / Fecha", "Cajero", "Almacén", "Duración", "Acciones"].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted ${i === 3 ? "text-center" : i === 4 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20 dark:divide-white/5">
              {loading ? (
                <tr><td colSpan="5" className="p-10 text-center"><Loading /></td></tr>
              ) : sessions.length > 0 ? (
                sessions.map((s) => (
                  <tr key={s.id} className="group hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="text-[10px] font-black text-content dark:text-white group-hover:text-brand-500 transition-colors">CIERRE #{s.id}</div>
                      <div className="text-[8px] font-bold text-content-subtle opacity-60 mt-0.5 uppercase">{fmtDate(s.closed_at)}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-[9px] font-black uppercase text-content dark:text-white tracking-tight">{s.employee?.full_name}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[9px] font-black text-brand-500 uppercase tracking-widest">{s.warehouse?.name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="text-[9px] font-black tabular-nums text-content-muted">
                        {Math.floor((new Date(s.closed_at) - new Date(s.opened_at)) / 3600000)}H {Math.floor(((new Date(s.closed_at) - new Date(s.opened_at)) % 3600000) / 60000)}M
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => viewSummary(s)}
                        className="px-3 py-1 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all active:scale-95">
                        Resumen
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="5" className="p-10 text-center text-[9px] text-content-subtle opacity-30 uppercase font-black tracking-widest">Sin sesiones</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSession && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-surface-dark-2 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-border dark:border-white/5">
            <div className="p-4 border-b border-border dark:border-white/5 flex items-center justify-between bg-surface-2 dark:bg-white/5">
              <div>
                <div className="text-[9px] font-black text-brand-500 uppercase tracking-[3px] mb-0.5">RESUMEN DE CAJA</div>
                <h3 className="text-sm font-black text-content dark:text-white uppercase tracking-tight">#{selectedSession.id} — {selectedSession.warehouse?.name}</h3>
              </div>
              <button onClick={() => { setSelectedSession(null); setSummaryData(null); }}
                className="w-8 h-8 rounded-full bg-surface-3 dark:bg-white/10 flex items-center justify-center hover:bg-danger hover:text-white text-content-muted transition-all">✕</button>
            </div>

            <div className="p-6 overflow-auto max-h-[70vh]">
              {loadingSummary ? (
                <Loading />
              ) : summaryData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Total Venta", value: fmt$(summaryData.sales.total_sales), color: "text-brand-500", sub: `${summaryData.sales.sale_count} rec.` },
                      { label: "Recibido", value: fmt$(summaryData.sales.total_paid), color: "text-green-500", sub: `${summaryData.sales.paid_count} items` },
                      { label: "Pendiente", value: fmt$(summaryData.sales.total_pending), color: "text-warning", sub: `${summaryData.sales.pending_count} items` },
                      { label: "Turno", value: `${new Date(selectedSession.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} / ${new Date(selectedSession.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, color: "text-content dark:text-white text-xs", sub: "" },
                    ].map(item => (
                      <div key={item.label} className="p-3 bg-surface-2 dark:bg-white/5 rounded-2xl border border-border/20 dark:border-white/5 text-center">
                        <div className="text-[8px] font-black text-content-muted dark:text-content-dark-muted uppercase tracking-widest mb-1">{item.label}</div>
                        <div className={`text-base font-black font-display ${item.color}`}>{item.value}</div>
                        {item.sub && <div className="text-[8px] font-bold text-content-subtle opacity-50 uppercase">{item.sub}</div>}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <SectionHeader title="Listado de Ventas del Turno" sub="Auditoría granular de transacciones" />
                    <div className="rounded-xl border border-border dark:border-white/5 overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-surface-2 dark:bg-white/5">
                          <tr>
                            {["ID / Cliente", "Estado", "Monto", "Hora", "Acción"].map((h, i) => (
                              <th key={h} className={`px-4 py-3 text-[9px] font-black uppercase tracking-widest text-content-muted ${i === 1 || i === 3 ? "text-center" : i === 2 || i === 4 ? "text-right" : ""}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20 dark:divide-white/5">
                          {summaryData.sales_list?.length > 0 ? (
                            summaryData.sales_list.map((sale, sIdx) => (
                              <tr key={sIdx} className="hover:bg-surface-2 dark:hover:bg-white/5 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="text-[10px] font-black uppercase tabular-nums text-content dark:text-white">#{sale.invoice_number || sale.id}</div>
                                  <div className="text-[9px] font-bold text-content-subtle opacity-60">{sale.customer_name || "Venta Casual"}</div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${(sale.status?.toLowerCase() === 'pagada' || sale.status?.toLowerCase() === 'pagado') ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                                    {sale.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="text-xs font-black text-green-500 tabular-nums">{fmt$(sale.total)}</div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="text-[9px] font-bold text-content-subtle">{new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button onClick={() => openReceipt(sale.id)}
                                    className="p-1.5 rounded-lg bg-surface-3 dark:bg-white/10 text-content-subtle hover:text-brand-500 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr><td colSpan="5" className="p-8 text-center text-[9px] font-black uppercase tracking-widest text-content-subtle opacity-30">No se registraron ventas en este turno</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <SectionHeader title="Conciliación por Diario" sub="Comparativa entre monto esperado y declarado" />
                    <div className="rounded-xl border border-border dark:border-white/5 overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-surface-2 dark:bg-white/5">
                          <tr>
                            {["Diario", "Inicio", "Ventas", "Esperado", "Declarado", "Dif."].map((h, i) => (
                              <th key={h} className={`px-4 py-3 text-[9px] font-black uppercase tracking-widest text-content-muted ${i >= 1 && i <= 4 ? "text-right" : i === 5 ? "text-center" : ""}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20 dark:divide-white/5">
                          {summaryData.journal_summary.map((js, idx) => (
                            <tr key={idx} className="text-xs font-black text-content dark:text-white">
                              <td className="px-4 py-3 flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: js.journal_color }} />
                                {js.journal_name}
                              </td>
                              <td className="px-4 py-3 text-right text-content-subtle tabular-nums">{js.opening_amount.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right text-brand-500 tabular-nums">+{js.cash_in.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right text-content dark:text-white tabular-nums">{js.expected_amount.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right text-green-500 tabular-nums">{js.closing_amount?.toFixed(2) || "0.00"}</td>
                              <td className={`px-4 py-3 text-center tabular-nums ${(js.difference || 0) < 0 ? "text-danger" : (js.difference || 0) > 0 ? "text-success" : "text-content-subtle opacity-40"}`}>
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

            <div className="p-4 bg-surface-2 dark:bg-white/5 border-t border-border dark:border-white/5 flex justify-end">
              <button onClick={() => { setSelectedSession(null); setSummaryData(null); }}
                className="px-6 py-2.5 bg-surface-3 dark:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-[2px] text-content dark:text-white hover:bg-surface-3 transition-all border border-border dark:border-white/5">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptSale && (
        <ReceiptModal open={!!receiptSale} onClose={() => setReceiptSale(null)} sale={receiptSale} />
      )}
    </div>
  );
}
