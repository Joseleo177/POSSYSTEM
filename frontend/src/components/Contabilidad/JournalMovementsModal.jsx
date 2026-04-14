import React, { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import DateRangePicker from "../ui/DateRangePicker";

const LIMIT = 100;

const fmtDate = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    return dt.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const fmtTime = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    return dt.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
};

export default function JournalMovementsModal({ journalId, onClose }) {
    const [movements, setMovements] = useState([]);
    const [journal, setJournal] = useState(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const sym = journal?.currency_symbol || "$";
    const fmtLocal = (n) => `${sym}${Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const load = useCallback(async () => {
        if (!journalId) return;
        setLoading(true);
        try {
            const params = { limit: LIMIT, offset: (page - 1) * LIMIT };
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const r = await api.journals.getMovements(journalId, params);
            setMovements(r.data || []);
            setJournal(r.journal || null);
            setTotal(r.total || 0);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [journalId, page, dateFrom, dateTo]);

    useEffect(() => { setPage(1); }, [dateFrom, dateTo]);
    useEffect(() => { load(); }, [load]);

    if (!journalId) return null;

    const totalPages = Math.ceil(total / LIMIT);
    const lastBalance = movements.length > 0 ? movements[movements.length - 1].balance : 0;

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md" onClick={onClose} />

            {/* Panel */}
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                <div
                    className="w-full max-w-5xl max-h-[90vh] bg-white dark:bg-surface-dark-2 rounded-2xl border border-border/40 dark:border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* ── Header ── */}
                    <div className="shrink-0 px-6 py-4 border-b border-border/20 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center border border-border/40 dark:border-white/10 shadow-inner"
                                style={{ backgroundColor: (journal?.color || "#14b8a6") + "15" }}
                            >
                                <svg className="w-5 h-5" fill="none" stroke={journal?.color || "#14b8a6"} viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-sm font-black text-content dark:text-white uppercase tracking-tight">
                                    Estado de Cuenta
                                </h2>
                                <p className="text-[10px] font-bold text-content-subtle uppercase tracking-widest mt-0.5">
                                    {journal?.name || "Diario"} {journal?.bank_name ? `· ${journal.bank_name}` : ""}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Saldo actual */}
                            <div className="text-right">
                                <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest">Saldo Actual</div>
                                <div className="text-lg font-black tabular-nums tracking-tighter" style={{ color: journal?.color || "#14b8a6" }}>
                                    {fmtLocal(lastBalance)}
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-2 dark:bg-white/5 border border-border/30 dark:border-white/10 text-content-subtle hover:text-danger hover:bg-danger/10 hover:border-danger/30 transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* ── Filtros ── */}
                    <div className="shrink-0 px-6 py-2 border-b border-border/20 dark:border-white/5 flex items-center gap-3">
                        <DateRangePicker
                            from={dateFrom}
                            to={dateTo}
                            setFrom={setDateFrom}
                            setTo={setDateTo}
                            className="flex-1 max-w-sm"
                        />
                        <div className="ml-auto text-[10px] font-bold text-content-subtle uppercase tracking-widest">
                            {total} movimientos
                        </div>
                    </div>

                    {/* ── Tabla de movimientos ── */}
                    <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2">
                                <tr>
                                    {["Fecha", "Hora", "Tipo", "Referencia", "Concepto", "Debe (Egreso)", "Haber (Ingreso)", "Saldo"].map((h) => (
                                        <th
                                            key={h}
                                            className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 border-b border-border/40 dark:border-white/5 ${
                                                ["Debe (Egreso)", "Haber (Ingreso)", "Saldo"].includes(h) ? "text-right" : ""
                                            }`}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10 dark:divide-white/5">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-16 text-center text-brand-500 animate-pulse text-xs font-black uppercase tracking-widest">
                                            Cargando movimientos...
                                        </td>
                                    </tr>
                                ) : movements.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-16 text-center text-content-subtle text-xs font-black uppercase tracking-wide italic opacity-40">
                                            Sin movimientos registrados
                                        </td>
                                    </tr>
                                ) : (
                                    movements.map((m, idx) => {
                                        const isVoided = m.status === "anulado";
                                        const isIngreso = m.type === "ingreso";

                                        return (
                                            <tr
                                                key={`${m.type}-${m.id}-${idx}`}
                                                className={`group transition-colors ${
                                                    isVoided
                                                        ? "opacity-40 bg-danger/[0.02]"
                                                        : "hover:bg-brand-500/[0.02]"
                                                }`}
                                            >
                                                {/* Fecha */}
                                                <td className="px-4 py-2.5">
                                                    <span className={`text-[11px] font-bold text-content-subtle uppercase ${isVoided ? "line-through" : ""}`}>
                                                        {fmtDate(m.date)}
                                                    </span>
                                                </td>

                                                {/* Hora */}
                                                <td className="px-4 py-2.5">
                                                    <span className="text-[10px] font-bold text-content-subtle opacity-60">
                                                        {fmtTime(m.date)}
                                                    </span>
                                                </td>

                                                {/* Tipo */}
                                                <td className="px-4 py-2.5">
                                                    <span
                                                        className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                                                            isVoided
                                                                ? "text-content-subtle border-border/30 bg-surface-2 dark:bg-white/5 line-through"
                                                                : isIngreso
                                                                ? "text-success border-success/30 bg-success/5"
                                                                : "text-danger border-danger/30 bg-danger/5"
                                                        }`}
                                                    >
                                                        {isVoided ? "ANULADO" : isIngreso ? "INGRESO" : "EGRESO"}
                                                    </span>
                                                </td>

                                                {/* Referencia */}
                                                <td className="px-4 py-2.5">
                                                    <span className={`text-[10px] font-black tracking-tight ${isVoided ? "text-content-subtle line-through" : "text-brand-500"}`}>
                                                        {m.reference}
                                                    </span>
                                                    {m.doc_ref && (
                                                        <div className="text-[8px] font-bold text-content-subtle opacity-50 mt-0.5">
                                                            Ref: {m.doc_ref}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Concepto */}
                                                <td className="px-4 py-2.5 max-w-[220px]">
                                                    <span className={`text-[11px] font-bold uppercase tracking-tight truncate block ${isVoided ? "text-content-subtle line-through" : "text-content dark:text-white"}`}>
                                                        {m.concept}
                                                    </span>
                                                    {m.notes && (
                                                        <div className="text-[8px] font-bold text-content-subtle opacity-40 mt-0.5 truncate">
                                                            {m.notes}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Debe (Egreso) */}
                                                <td className="px-4 py-2.5 text-right">
                                                    {!isIngreso && (
                                                        <span className={`text-[11px] font-black tabular-nums ${isVoided ? "text-content-subtle line-through" : "text-danger"}`}>
                                                            -{fmtLocal(m.amount_local)}
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Haber (Ingreso) */}
                                                <td className="px-4 py-2.5 text-right">
                                                    {isIngreso && (
                                                        <span className="text-[11px] font-black tabular-nums text-success">
                                                            +{fmtLocal(m.amount_local)}
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Saldo */}
                                                <td className="px-4 py-2.5 text-right">
                                                    <span className={`text-[11px] font-black tabular-nums ${
                                                        m.balance >= 0 ? "text-content dark:text-white" : "text-danger"
                                                    }`}>
                                                        {fmtLocal(m.balance)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Footer / Paginación ── */}
                    <div className="shrink-0 px-6 py-3 border-t border-border/20 dark:border-white/5 flex items-center justify-between bg-surface-2/50 dark:bg-white/[0.01]">
                        <div className="text-[10px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest">
                            Mostrando <span className="text-content dark:text-white">{movements.length}</span> de <span className="text-content dark:text-white">{total}</span>
                        </div>
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1.5">
                                <button
                                    disabled={page === 1}
                                    onClick={() => setPage(1)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30"
                                >
                                    «
                                </button>
                                <button
                                    disabled={page === 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30"
                                >
                                    Anterior
                                </button>
                                <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">
                                    Pág {page}/{totalPages}
                                </div>
                                <button
                                    disabled={page === totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30"
                                >
                                    Siguiente
                                </button>
                                <button
                                    disabled={page === totalPages}
                                    onClick={() => setPage(totalPages)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30"
                                >
                                    »
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
