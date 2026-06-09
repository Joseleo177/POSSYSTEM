import { useState, useEffect } from "react";
import { api } from "../../services/api";

export default function JournalSummary({ dateFrom, dateTo, onData, onSelectJournal }) {
    const [data, setData] = useState([]);

    useEffect(() => {
        const params = {};
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo)   params.date_to   = dateTo;
        api.journals.getSummary(params).then(r => {
            setData(r.data);
            onData?.(r.data);
        }).catch(() => {});
    }, [dateFrom, dateTo, onData]);

    // ── Agrupar por banco + moneda ─────────────────────────────
    const bankGroups = {};
    data.forEach(j => {
        // Journals sin banco → card individual por diario
        const key = j.bank_id ? `bank_${j.bank_id}_${j.currency_code ?? "base"}` : `journal_${j.id}`;
        if (!bankGroups[key]) {
            bankGroups[key] = {
                key,
                bank_id:      j.bank_id,
                display_name: j.bank_id ? (j.bank_name || j.name) : j.name,
                journals:     [],
                total_ingresos: 0,
                ingresos_hoy:   0,
                tx_count:       0,
                currency_symbol: j.currency_symbol,
                currency_code:   j.currency_code,
                color: j.color || "#14b8a6",
            };
        }
        bankGroups[key].total_ingresos += parseFloat(j.total_ingresos || 0);
        bankGroups[key].ingresos_hoy   += parseFloat(j.ingresos_hoy   || 0);
        bankGroups[key].tx_count       += parseInt(j.tx_count         || 0);
        bankGroups[key].journals.push(j);
    });
    const groups = Object.values(bankGroups);

    if (!groups.length) return (
        <div className="flex flex-col items-center justify-center py-8 opacity-40">
            <svg className="w-8 h-8 mb-2 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10m14 0v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v14" />
            </svg>
            <div className="text-[11px] font-black uppercase tracking-wide text-content-muted">Sin datos de bancos</div>
        </div>
    );

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {groups.map(group => {
                const sym     = group.currency_symbol || "Ref.";
                const fmt     = n => `${sym}${Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const color   = group.color;
                const handleCardClick = () => {
                    // Si tiene banco → abrir vista de banco (todos los diarios)
                    // Si no tiene banco → abrir diario individual
                    if (group.bank_id) {
                        onSelectJournal?.({ bank_id: group.bank_id });
                    } else {
                        onSelectJournal?.(group.journals[0]);
                    }
                };

                return (
                    <div
                        key={group.key}
                        className="group relative bg-white dark:bg-surface-dark-3 rounded-2xl border border-border/40 dark:border-white/10 shadow-sm hover:shadow-xl hover:border-brand-500/20 transition-all duration-300 overflow-hidden"
                    >
                        {/* Color bar */}
                        <div className="absolute top-0 left-0 w-full h-1" style={{ background: color }} />

                        {/* Card principal — clickeable */}
                        <div
                            onClick={handleCardClick}
                            className="p-5 cursor-pointer select-none"
                        >
                            {/* Encabezado */}
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-8 h-8 rounded-xl flex items-center justify-center border border-border/40 dark:border-white/10 bg-surface-2 dark:bg-white/5 shadow-inner group-hover:bg-brand-500/10 transition-colors"
                                        style={{ color }}
                                    >
                                        {/* Ícono banco */}
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M8 6h.01M8 18h.01M12 6h.01M12 18h.01M16 6h.01M16 18h.01M5 6a2 2 0 00-2 2v8a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2H5z" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-[11px] font-black text-content dark:text-white uppercase tracking-widest truncate max-w-[140px]">
                                            {group.display_name}
                                        </h4>
                                        {group.journals.length > 1 ? (
                                            <div className="text-[9px] font-bold text-content-subtle uppercase tracking-widest opacity-60">
                                                {group.journals.length} diarios
                                            </div>
                                        ) : group.bank_id && group.journals[0]?.name !== group.display_name ? (
                                            <div className="text-[9px] font-bold text-content-subtle uppercase tracking-widest opacity-60 truncate max-w-[140px]">
                                                {group.journals[0].name}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    {group.currency_code && (
                                        <span className="text-[9px] font-black text-content-subtle bg-surface-2 dark:bg-white/5 px-2 py-0.5 rounded-lg border border-border/40 dark:border-white/5 uppercase tracking-tighter">
                                            {group.currency_code}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Saldo neto */}
                            <div className="mb-5">
                                <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1">Saldo Neto</div>
                                <div className="text-2xl font-black tracking-tighter tabular-nums" style={{ color }}>
                                    {fmt(group.total_ingresos)}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between pt-4 border-t border-border/20 dark:border-white/5">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-0.5 opacity-60">Movimientos</span>
                                    <span className="text-xs font-black text-content dark:text-white tabular-nums">
                                        {group.tx_count} <span className="opacity-30">TX</span>
                                    </span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-black text-success/60 uppercase tracking-widest mb-0.5">Flujo Hoy</span>
                                    <span className={`text-xs font-black tabular-nums ${group.ingresos_hoy >= 0 ? "text-success" : "text-danger"}`}>
                                        {group.ingresos_hoy >= 0 ? "+" : ""}{fmt(group.ingresos_hoy)}
                                    </span>
                                </div>
                            </div>
                        </div>

                    </div>
                );
            })}
        </div>
    );
}
