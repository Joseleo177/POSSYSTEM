import { useState, useEffect } from "react";
import { api } from "../services/api";
import { fmtMoney } from "../helpers";

const fmt$ = (n) => fmtMoney(parseFloat(n) || 0, "$");

export default function CierreCajaModal({ session, onClosed, onCancel }) {
 const [summary, setSummary] = useState(null);
 const [loadingSummary, setLoadingSummary] = useState(true);
 const [closingAmounts, setClosingAmounts] = useState({}); // { [journal_id]: string }
 const [notes, setNotes] = useState("");
 const [saving, setSaving] = useState(false);
 const [error, setError] = useState("");

 useEffect(() => {
 api.cashSessions.summary(session.id)
 .then(r => {
 setSummary(r.data);
 // Pre-inicializar inputs de cierre
 const init = {};
 (r.data.journal_summary || []).forEach(j => { init[j.journal_id] = ""; });
 setClosingAmounts(init);
 })
 .catch(() => setError("Error al cargar el resumen"))
 .finally(() => setLoadingSummary(false));
 }, [session.id]);

 const setAmount = (id, val) =>
 setClosingAmounts(prev => ({ ...prev, [id]: val }));

 const handleClose = async () => {
 const journals = (summary?.journal_summary || []).map(j => ({
 journal_id: j.journal_id,
 closing_amount: parseFloat(closingAmounts[j.journal_id]) || 0,
 }));

 setSaving(true);
 setError("");
 try {
 const res = await api.cashSessions.close(session.id, { journals, notes });
 onClosed(res.data);
 } catch (e) {
 setError(e.message || "Error al cerrar caja");
 setSaving(false);
 }
 };

 const openedAt = new Date(session.opened_at);
 const duration = Math.round((Date.now() - openedAt.getTime()) / 60000);
 const durationLabel = duration >= 60 ? `${Math.floor(duration / 60)}h ${duration % 60}m` : `${duration} min`;
 const allFilled = summary?.journal_summary?.every(j => closingAmounts[j.journal_id] !== "");

 return (
 <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-300">
 <div className="w-full max-w-lg bg-surface-2 dark:bg-[#141414] border border-border/40 dark:border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

 {/* Header */}
 <div className="bg-warning/10 border-b border-warning/20 px-7 py-5 flex items-center gap-4 shrink-0">
 <div className="w-12 rounded-2xl bg-warning/20 flex items-center justify-center shadow-inner">
 <svg className="w-6 h-6 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
 </div>
 <div className="flex-1 min-w-0">
 <div className="text-[11px] font-black uppercase tracking-wide text-warning/70">CIERRE DE TURNO</div>
 <div className="text-lg font-black text-content dark:text-content-dark">Cierre de Caja</div>
 <div className="text-[11px] text-content-subtle font-bold mt-0.5">{session.warehouse?.name} · {session.employee?.full_name}</div>
 </div>
 <div className="text-right shrink-0">
 <div className="text-[11px] text-content-subtle font-bold uppercase">Duración</div>
 <div className="text-sm font-black text-warning">{durationLabel}</div>
 </div>
 </div>

 <div className="flex-1 overflow-y-auto p-5 space-y-5">
 {loadingSummary ? (
 <div className="flex items-center justify-center py-16">
 <div className="w-8 h-8 border-2 border-warning border-t-transparent rounded-full animate-spin" />
 </div>
 ) : summary && (
 <>
 {/* KPIs del turno */}
 <div className="grid grid-cols-3 gap-3">
 <div className="bg-surface-3 dark:bg-white/5 rounded-2xl p-3 text-center">
 <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle mb-1">Ventas</div>
 <div className="text-xl font-black text-content dark:text-content-dark">{summary.sales.sale_count}</div>
 </div>
 <div className="bg-surface-3 dark:bg-white/5 rounded-2xl p-3 text-center">
 <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle mb-1">Facturado</div>
 <div className="text-sm font-black text-success">{fmt$(summary.sales.total_sales)}</div>
 </div>
 <div className="bg-surface-3 dark:bg-white/5 rounded-2xl p-3 text-center">
 <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle mb-1">Pendientes</div>
 <div className="text-xl font-black text-danger">{summary.sales.pending_count}</div>
 </div>
 </div>

 {/* Cobros por método (todos los métodos) */}
 {summary.payments_by_journal.length > 0 && (
 <div className="bg-surface-3 dark:bg-white/5 rounded-2xl p-4">
 <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle mb-3">Todos los Cobros</div>
 {summary.payments_by_journal.map((p, i) => (
 <div key={i} className="flex items-center justify-between py-2 border-b border-border/10 dark:border-white/5 last:border-0">
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 rounded-full" style={{ background: p.journal_color || "#555" }} />
 <span className="text-xs font-bold text-content dark:text-content-dark">{p.journal_name}</span>
 <span className="text-[11px] text-content-subtle">{p.payment_count} cobros</span>
 </div>
 <span className="font-black text-sm text-success">{fmtMoney(p.total, p.currency_symbol || "$")}</span>
 </div>
 ))}
 </div>
 )}

 {/* Cuadre por cada caja de efectivo */}
 <div>
 <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle mb-3">Cuadre de Efectivo por Caja</div>
 <div className="space-y-4">
 {summary.journal_summary.map(j => {
 const sym = j.currency_symbol || "$";
 const f = (n) => fmtMoney(parseFloat(n) || 0, sym);

 const closing = parseFloat(closingAmounts[j.journal_id]) || 0;
 const diff = closingAmounts[j.journal_id] !== "" ? closing - j.expected_amount : null;
 const diffColor = diff === null ? "" : diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-content-muted dark:text-content-dark-muted";
 const diffLabel = diff === null ? "" : diff > 0 ? `+${f(diff)} sobrante` : diff < 0 ? `${f(diff)} faltante` : "Cuadra correctamente";

 return (
 <div key={j.journal_id} className="bg-surface-3 dark:bg-white/5 rounded-2xl p-4">
 <div className="flex items-center gap-2 mb-3">
 <div className="w-2.5 h-2.5 rounded-full" style={{ background: j.journal_color || "#555" }} />
 <span className="font-black text-sm text-content dark:text-content-dark">{j.journal_name}</span>
 </div>
 <div className="flex flex-col gap-3 mb-4 bg-black/5 dark:bg-white/5 rounded-xl p-3 border border-border/20 dark:border-white/5">
 <div className="flex justify-between items-center text-xs">
 <span className="font-black text-content-subtle uppercase tracking-wide text-[11px]">Fondo Inicial</span>
 <span className="font-black tabular-nums">{f(j.opening_amount)}</span>
 </div>
 <div className="flex justify-between items-center text-xs">
 <span className="font-black text-content-subtle uppercase tracking-wide text-[11px]">Ingresos (Cobros)</span>
 <span className="font-black text-success tabular-nums">+{f(j.cash_in)}</span>
 </div>
 <div className="flex justify-between items-center py-2 border-t border-border/10 dark:border-white/10">
 <span className="font-black text-content-subtle uppercase tracking-wide text-[11px]">Total Esperado</span>
 <span className="text-sm font-black text-warning tabular-nums">{f(j.expected_amount)}</span>
 </div>
 </div>
 <div className="relative">
 <input
 type="number" min="0" step="0.01"
 value={closingAmounts[j.journal_id] ?? ""}
 onChange={e => setAmount(j.journal_id, e.target.value)}
 placeholder={`Conteo real (esperado: ${f(j.expected_amount)})`}
 className="w-full bg-white/5 border-2 border-warning/30 rounded-xl px-4 py-2.5 pr-8 text-sm font-black text-warning outline-none focus:ring-2 focus:ring-warning/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all"
 />
 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-subtle text-xs font-black">{sym}</span>
 </div>
 {diffLabel && (
 <div className={`text-center text-xs font-black mt-2 ${diffColor}`}>{diffLabel}</div>
 )}
 </div>
 );
 })}
 </div>
 </div>

 {/* Devoluciones */}
 {summary.returns?.count > 0 && (
 <div className="bg-danger/5 border border-danger/20 rounded-2xl p-3 flex justify-between items-center">
 <span className="text-xs font-black text-danger">Devoluciones en el turno</span>
 <span className="text-sm font-black text-danger">{summary.returns.count} · -{fmt$(summary.returns.total)}</span>
 </div>
 )}

 {/* Notas */}
 <div>
 <label className="block text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted mb-2">Notas (opcional)</label>
 <textarea value={notes} onChange={e => setNotes(e.target.value)}
 placeholder="Observaciones del turno..." rows={2}
 className="w-full bg-surface-3 dark:bg-white/5 border border-border dark:border-white/10 rounded-2xl px-4 py-3 text-sm text-content dark:text-content-dark outline-none focus:ring-2 focus:ring-warning/20 resize-none" />
 </div>
 </>
 )}

 {error && (
 <div className="bg-danger/10 border border-danger/20 text-danger text-xs font-bold rounded-xl px-4 py-3">{error}</div>
 )}
 </div>

 {/* Footer */}
 <div className="p-5 border-t border-border/20 dark:border-white/5 flex gap-3 shrink-0">
 <button onClick={onCancel}
 className="flex-1 py-4 rounded-2xl border border-border dark:border-white/10 font-black text-[11px] uppercase tracking-wide text-content-muted dark:text-content-dark-muted hover:bg-surface-3 dark:hover:bg-white/5 transition-all cursor-pointer">
 Cancelar
 </button>
 <button onClick={handleClose} disabled={saving || loadingSummary || !allFilled}
 className={`flex-[2] py-4 rounded-2xl font-black text-[11px] uppercase tracking-wide transition-all cursor-pointer
 ${saving || loadingSummary || !allFilled
 ? "bg-surface-3 dark:bg-white/5 text-content-subtle cursor-not-allowed"
 : "bg-warning text-white hover:scale-[1.01] active:scale-100 shadow-lg shadow-warning/20"}`}>
 <div className="flex items-center justify-center gap-2">
 {!saving && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
 {saving ? "Cerrando..." : "Finalizar Turno y Cerrar Caja"}
 </div>
 </button>
 </div>
 </div>
 </div>
 );
}
