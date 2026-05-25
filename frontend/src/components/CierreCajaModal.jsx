import { useState, useEffect } from "react";
import { api } from "../services/api";
import { fmtMoney } from "../helpers";

const fmt$ = (n) => fmtMoney(parseFloat(n) || 0);

export default function CierreCajaModal({ session, onClosed, onCancel }) {
    const [summary, setSummary]           = useState(null);
    const [loadingSummary, setLoadingSummary] = useState(true);
    const [closingAmounts, setClosingAmounts] = useState({});
    const [notes, setNotes]               = useState("");
    const [saving, setSaving]             = useState(false);
    const [error, setError]               = useState("");

    useEffect(() => {
        api.cashSessions.summary(session.id)
            .then(r => {
                setSummary(r.data);
                const init = {};
                (r.data.journal_summary || []).forEach(j => { init[j.journal_id] = ""; });
                setClosingAmounts(init);
            })
            .catch(() => setError("Error al cargar el resumen"))
            .finally(() => setLoadingSummary(false));
    }, [session.id]);

    const setAmount = (id, val) => setClosingAmounts(prev => ({ ...prev, [id]: val }));

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

    const openedAt    = new Date(session.opened_at);
    const duration    = Math.round((Date.now() - openedAt.getTime()) / 60000);
    const durationLabel = duration >= 60 ? `${Math.floor(duration / 60)}h ${duration % 60}m` : `${duration} min`;
    const allFilled   = summary?.journal_summary?.every(j => closingAmounts[j.journal_id] !== "");

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onCancel}
        >
            <div
                className="relative w-full max-w-md bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 slide-in-from-bottom-3 duration-200 ease-out"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 px-5 py-4 border-b border-border/10 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.03]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-warning/10 text-warning flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">
                                Cierre de Turno
                            </div>
                            <div className="text-sm font-black text-content dark:text-white">
                                {session.warehouse?.name || "Caja Principal"}
                            </div>
                            <div className="text-[10px] font-bold text-content-subtle dark:text-white/30 mt-0.5">
                                {session.employee?.full_name} · {durationLabel}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:bg-surface-2 dark:hover:bg-white/10 transition-all"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {loadingSummary ? (
                        <div className="flex items-center justify-center py-16 gap-3 text-content-subtle dark:text-white/30">
                            <svg className="w-5 h-5 animate-spin text-warning" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-[12px] font-black uppercase tracking-wide animate-pulse">Cargando…</span>
                        </div>
                    ) : summary && (
                        <>
                            {/* KPIs */}
                            <div className="px-5 pt-4 pb-3 grid grid-cols-3 gap-2 border-b border-border/10 dark:border-white/5">
                                {[
                                    { label: "Ventas",     value: summary.sales.sale_count,              color: "text-content dark:text-white" },
                                    { label: "Facturado",  value: fmt$(summary.sales.total_sales),        color: "text-success" },
                                    { label: "Pendientes", value: summary.sales.pending_count,            color: summary.sales.pending_count > 0 ? "text-danger" : "text-content dark:text-white" },
                                ].map(({ label, value, color }) => (
                                    <div key={label} className="bg-surface-2/50 dark:bg-white/[0.03] rounded-xl p-2.5 border border-border/20 dark:border-white/5 text-center">
                                        <div className="text-[10px] font-black text-content-subtle dark:text-white/30 uppercase tracking-wide mb-0.5">{label}</div>
                                        <div className={`text-[13px] font-black tabular-nums ${color}`}>{value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Cobros por método */}
                            {summary.payments_by_journal.length > 0 && (
                                <div className="px-5 pt-4 pb-3 border-b border-border/10 dark:border-white/5">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-2">
                                        Todos los Cobros
                                    </div>
                                    <div className="rounded-xl border border-border/20 dark:border-white/5 overflow-hidden divide-y divide-border/10 dark:divide-white/5">
                                        {summary.payments_by_journal.map((p, i) => (
                                            <div key={i} className="flex items-center justify-between px-3 py-2 bg-surface-2/30 dark:bg-white/[0.02]">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.journal_color || "#555" }} />
                                                    <span className="text-[11px] font-bold text-content dark:text-white">{p.journal_name}</span>
                                                    <span className="text-[10px] text-content-subtle dark:text-white/30">{p.payment_count} cobros</span>
                                                </div>
                                                <span className="text-[12px] font-black text-success tabular-nums">{fmtMoney(p.total, p.currency_symbol || "Ref.")}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Cuadre de efectivo */}
                            <div className="px-5 pt-4 pb-3 border-b border-border/10 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-2">
                                    Cuadre de Efectivo
                                </div>
                                <div className="space-y-3">
                                    {summary.journal_summary.map(j => {
                                        const sym = j.currency_symbol || "Ref.";
                                        const f   = (n) => fmtMoney(parseFloat(n) || 0, sym);
                                        const closing   = parseFloat(closingAmounts[j.journal_id]) || 0;
                                        const diff      = closingAmounts[j.journal_id] !== "" ? closing - j.expected_amount : null;
                                        const diffColor = diff === null ? "" : diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-content-subtle dark:text-white/40";
                                        const diffLabel = diff === null ? "" : diff > 0 ? `+${f(diff)} sobrante` : diff < 0 ? `${f(diff)} faltante` : "Cuadra correctamente";

                                        return (
                                            <div key={j.journal_id} className="bg-surface-2/50 dark:bg-white/[0.03] rounded-xl border border-border/20 dark:border-white/5 overflow-hidden">
                                                {/* Caja header */}
                                                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/10 dark:border-white/5">
                                                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: j.journal_color || "#555" }} />
                                                    <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight">{j.journal_name}</span>
                                                </div>
                                                {/* Desglose */}
                                                <div className="px-3 py-2 space-y-1.5">
                                                    {[
                                                        { label: "Fondo Inicial",     value: f(j.opening_amount),  color: "" },
                                                        { label: "Ingresos (Cobros)", value: `+${f(j.cash_in)}`,   color: "text-success" },
                                                        { label: "Total Esperado",    value: f(j.expected_amount), color: "text-warning", bold: true },
                                                    ].map(({ label, value, color, bold }) => (
                                                        <div key={label} className="flex justify-between items-center">
                                                            <span className="text-[10px] font-black text-content-subtle dark:text-white/30 uppercase tracking-wide">{label}</span>
                                                            <span className={`text-[11px] tabular-nums ${bold ? "font-black" : "font-bold"} ${color || "text-content dark:text-white"}`}>{value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                {/* Input conteo */}
                                                <div className="px-3 pb-3">
                                                    <div className="relative mt-1">
                                                        <input
                                                            type="number" min="0" step="0.01"
                                                            value={closingAmounts[j.journal_id] ?? ""}
                                                            onChange={e => setAmount(j.journal_id, e.target.value)}
                                                            placeholder={`Conteo real (esperado: ${f(j.expected_amount)})`}
                                                            className="w-full bg-white dark:bg-white/5 border border-warning/30 focus:border-warning/60 rounded-lg px-3 py-2 pr-10 text-[12px] font-black text-warning placeholder:text-content-subtle/50 dark:placeholder:text-white/20 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-content-subtle dark:text-white/30">{sym}</span>
                                                    </div>
                                                    {diffLabel && (
                                                        <div className={`text-center text-[10px] font-black mt-1.5 uppercase tracking-wide ${diffColor}`}>{diffLabel}</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Devoluciones */}
                            {summary.returns?.count > 0 && (
                                <div className="px-5 pt-3 pb-3 border-b border-border/10 dark:border-white/5">
                                    <div className="flex justify-between items-center bg-danger/5 border border-danger/15 rounded-xl px-3 py-2">
                                        <span className="text-[10px] font-black text-danger uppercase tracking-wide">Devoluciones en el turno</span>
                                        <span className="text-[11px] font-black text-danger tabular-nums">{summary.returns.count} · -{fmt$(summary.returns.total)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Notas */}
                            <div className="px-5 pt-3 pb-4">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-2">Notas (Opcional)</div>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Observaciones del turno..."
                                    rows={2}
                                    className="w-full bg-surface-2/50 dark:bg-white/[0.03] border border-border/20 dark:border-white/5 rounded-xl px-3 py-2 text-[12px] font-medium text-content dark:text-white placeholder:text-content-subtle/40 dark:placeholder:text-white/20 outline-none focus:border-warning/40 transition-all resize-none"
                                />
                            </div>
                        </>
                    )}

                    {error && (
                        <div className="mx-5 mb-4 bg-danger/10 border border-danger/20 text-danger text-[11px] font-bold rounded-xl px-3 py-2">{error}</div>
                    )}
                </div>

                {/* Footer */}
                <div className="shrink-0 px-5 py-4 border-t border-border/10 dark:border-white/5 flex gap-2 bg-surface-2/30 dark:bg-white/[0.02]">
                    <button
                        onClick={onCancel}
                        className="flex-1 h-9 rounded-xl border border-border/30 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle hover:bg-surface-2 dark:hover:bg-white/10 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleClose}
                        disabled={saving || loadingSummary || !allFilled}
                        className={[
                            "flex-[2] h-9 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all flex items-center justify-center gap-2",
                            saving || loadingSummary || !allFilled
                                ? "bg-surface-2 dark:bg-white/5 text-content-subtle cursor-not-allowed"
                                : "bg-warning text-black hover:brightness-105 active:scale-[0.99] shadow-lg shadow-warning/20"
                        ].join(" ")}
                    >
                        {!saving && (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        )}
                        {saving ? "Cerrando…" : "Finalizar Turno y Cerrar Caja"}
                    </button>
                </div>
            </div>
        </div>
    );
}
