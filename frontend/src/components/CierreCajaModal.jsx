import { useState, useEffect } from "react";
import { api } from "../services/api";
import { fmtMoney, toNameCase } from "../helpers";
import { Spinner } from "./ui/Spinner";
import Money from "./ui/Money";

const fmt$ = (n) => fmtMoney(parseFloat(n) || 0);

// Fila etiqueta / monto del desglose de una caja.
const Linea = ({ label, value, strong }) => (
    <div className={`flex justify-between items-baseline gap-3 ${strong ? "pt-2 mt-1 border-t border-border/70 dark:border-white/[0.06]" : ""}`}>
        <span className={`text-[13px] ${strong ? "font-semibold text-content dark:text-white" : "text-content-subtle"}`}>{label}</span>
        <Money value={value} className={`${strong ? "text-[15px] font-bold" : "text-[13px] font-medium"} text-content dark:text-white`} />
    </div>
);

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
    const durationLabel = duration >= 60 ? `${Math.floor(duration / 60)} h ${duration % 60} min` : `${duration} min`;
    const allFilled   = summary?.journal_summary?.every(j => closingAmounts[j.journal_id] !== "");
    const bloqueado   = saving || loadingSummary || !allFilled;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in"
            onClick={onCancel}
        >
            <div
                className="relative w-full max-w-md bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] overflow-hidden flex flex-col max-h-[90vh] modal-in"
                onClick={e => e.stopPropagation()}
            >
                {/* Cabecera. El ámbar de antes (icono, total esperado, conteo, botón) hacía
                    que todo el cierre se leyera como una advertencia. */}
                <div className="shrink-0 pl-6 pr-4 pt-5 pb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <div className="text-[17px] font-bold tracking-[-0.015em] text-content dark:text-white">Cierre de turno</div>
                            <div className="text-[13px] text-content-subtle truncate">
                                {toNameCase(session.warehouse?.name) || "Caja principal"} · {toNameCase(session.employee?.full_name)} · {durationLabel}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        aria-label="Cerrar"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:text-content hover:bg-surface-3 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {loadingSummary ? (
                        <div className="flex items-center justify-center py-16 gap-3 text-content-subtle">
                            <div className="w-5 h-5 rounded-full border-2 border-content-subtle/20 border-t-content-subtle animate-spin" />
                            <span className="text-[13px]">Cargando el resumen…</span>
                        </div>
                    ) : summary && (
                        <>
                            {/* El turno en tres cifras, en una sola franja. */}
                            <div className="mx-6 grid grid-cols-3 rounded-lg bg-surface-2 dark:bg-white/[0.04] divide-x divide-border/70 dark:divide-white/[0.06]">
                                {[
                                    { label: "Ventas",     value: summary.sales.sale_count },
                                    { label: "Facturado",  value: <Money value={fmt$(summary.sales.total_sales)} /> },
                                    { label: "Pendientes", value: summary.sales.pending_count, alerta: summary.sales.pending_count > 0 },
                                ].map(({ label, value, alerta }) => (
                                    <div key={label} className="px-3 py-3 text-center min-w-0">
                                        <div className="text-[12px] text-content-subtle mb-1">{label}</div>
                                        <div className={`text-[16px] font-bold tabular-nums truncate ${alerta ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`}>{value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Cobros por método */}
                            {summary.payments_by_journal.length > 0 && (
                                <div className="px-6 pt-5">
                                    <div className="text-[14px] font-semibold text-content dark:text-white mb-2">Cobros del turno</div>
                                    <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
                                        {summary.payments_by_journal.map((p, i) => (
                                            <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.journal_color || "#94a3b8" }} />
                                                    <span className="text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(p.journal_name)}</span>
                                                    <span className="text-[12px] text-content-subtle shrink-0">{p.payment_count} {p.payment_count === 1 ? "cobro" : "cobros"}</span>
                                                </div>
                                                <Money value={fmtMoney(p.total, p.currency_symbol || "Ref.")} className="text-[13px] font-semibold text-content dark:text-white" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Cuadre de efectivo */}
                            <div className="px-6 pt-5">
                                <div className="text-[14px] font-semibold text-content dark:text-white">Cuadre de efectivo</div>
                                <div className="text-[12px] text-content-subtle mb-3">Cuenta lo que hay en cada gaveta y anótalo.</div>
                                <div className="space-y-3">
                                    {summary.journal_summary.map(j => {
                                        const sym = j.currency_symbol || "Ref.";
                                        const f   = (n) => fmtMoney(parseFloat(n) || 0, sym);
                                        const closing   = parseFloat(closingAmounts[j.journal_id]) || 0;
                                        const diff      = closingAmounts[j.journal_id] !== "" ? closing - j.expected_amount : null;
                                        // Cuadra, sobra o falta: con color y en palabras. Una diferencia
                                        // menor a un céntimo es redondeo, no un descuadre.
                                        const estado = diff === null ? null
                                            : Math.abs(diff) < 0.005 ? { txt: "Cuadra exacto", cls: "text-emerald-700 dark:text-emerald-400", icon: "M5 13l4 4L19 7" }
                                            : diff > 0 ? { txt: `Sobran ${f(diff)}`, cls: "text-amber-700 dark:text-amber-400", icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }
                                            : { txt: `Faltan ${f(-diff)}`, cls: "text-red-600 dark:text-red-400", icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" };

                                        return (
                                            <div key={j.journal_id} className="rounded-xl border border-border/70 dark:border-white/[0.08] overflow-hidden">
                                                <div className="flex items-center gap-2 px-4 pt-3">
                                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: j.journal_color || "#94a3b8" }} />
                                                    <span className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(j.journal_name)}</span>
                                                </div>
                                                {/* Desglose. Cada movimiento que tocó la gaveta aparece con su
                                                    signo: sin él el cajero sumaba fondo + cobros, le daba
                                                    distinto del total y no sabía de dónde salía la diferencia.
                                                    Las líneas en cero se omiten para no llenar de ruido. */}
                                                <div className="px-4 pt-2 pb-3 space-y-1.5">
                                                    <Linea label="Fondo inicial" value={f(j.opening_amount)} />
                                                    <Linea label="Cobros en efectivo" value={`+${f(j.cash_in)}`} />
                                                    {parseFloat(j.manual_in) > 0 && <Linea label="Ingresos manuales" value={`+${f(j.manual_in)}`} />}
                                                    {parseFloat(j.cash_out ?? j.change_out) > 0 && <Linea label="Egresos y vueltos" value={`-${f(j.cash_out ?? j.change_out)}`} />}
                                                    <Linea label="Debería haber" value={f(j.expected_amount)} strong />
                                                </div>
                                                {/* Conteo real */}
                                                <div className="px-4 py-3 bg-surface-2/70 dark:bg-white/[0.03] border-t border-border/70 dark:border-white/[0.06]">
                                                    <label className="block text-[12px] font-medium text-content-subtle mb-1.5">Conteo real</label>
                                                    <div className="relative">
                                                        <input
                                                            type="number" min="0" step="0.01" inputMode="decimal"
                                                            value={closingAmounts[j.journal_id] ?? ""}
                                                            onChange={e => setAmount(j.journal_id, e.target.value)}
                                                            placeholder="0.00"
                                                            className="input h-11 pr-12 text-[16px] font-semibold tabular-nums"
                                                        />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-content-subtle">{sym}</span>
                                                    </div>
                                                    {estado && (
                                                        <div className={`flex items-center gap-1.5 mt-2 text-[13px] font-semibold ${estado.cls}`}>
                                                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={estado.icon} /></svg>
                                                            {estado.txt}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Devoluciones */}
                            {summary.returns?.count > 0 && (
                                <div className="mx-6 mt-4 flex justify-between items-center gap-3 rounded-lg bg-surface-2 dark:bg-white/[0.04] px-3 py-2.5">
                                    <span className="text-[13px] text-content-subtle">
                                        Devoluciones en el turno · {summary.returns.count}
                                    </span>
                                    <Money value={`-${fmt$(summary.returns.total)}`} className="text-[13px] font-semibold text-red-600 dark:text-red-400" />
                                </div>
                            )}

                            {/* Notas */}
                            <div className="px-6 pt-5 pb-5">
                                <label className="block text-[13px] font-semibold text-content dark:text-white mb-1.5">
                                    Notas <span className="font-normal text-content-subtle">· opcional</span>
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Algo que deba saber quien revise este cierre"
                                    rows={2}
                                    className="input !h-auto py-2.5 resize-none leading-relaxed"
                                />
                            </div>
                        </>
                    )}

                    {error && (
                        <div className="mx-6 mb-4 bg-red-500/10 text-red-700 dark:text-red-400 text-[13px] font-medium rounded-lg px-3 py-2.5">{error}</div>
                    )}
                </div>

                {/* Pie */}
                <div className="shrink-0 px-6 py-4 border-t border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02]">
                    {!loadingSummary && !allFilled && (
                        <div className="text-[12px] text-content-subtle mb-2.5 text-center">Anota el conteo de cada caja para poder cerrar.</div>
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={onCancel}
                            className="btn-outline flex-1 h-10 rounded-lg text-[13px] font-semibold"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleClose}
                            disabled={bloqueado}
                            className={`flex-[2] h-10 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-all ${bloqueado
                                ? "bg-surface-3 dark:bg-white/[0.06] text-content-subtle cursor-not-allowed"
                                : "btn-accent active:scale-[0.99]"}`}
                        >
                            {saving ? <Spinner className="h-3.5 w-3.5" /> : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            )}
                            {saving ? "Cerrando…" : "Cerrar turno"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
