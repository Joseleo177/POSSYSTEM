import { useState, useEffect } from "react";
import { api } from "../../services/api";

// ── Balance por diario (suma payments) ────────────────────────
export default function JournalSummary({ dateFrom, dateTo, onData, onSelectJournal }) {
 const [data, setData] = useState([]);
 useEffect(() => {
 const params = {};
 if (dateFrom) params.date_from = dateFrom;
 if (dateTo) params.date_to = dateTo;
 api.journals.getSummary(params).then(r => {
 setData(r.data);
 onData?.(r.data);
 }).catch(() => { });
 }, [dateFrom, dateTo, onData]);

 if (!data.length) return (
 <div className="flex flex-col items-center justify-center py-8 opacity-40">
 <div className="text-2xl mb-2 text-brand-500">
 <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10m14 0v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v14" /></svg>
 </div>
 <div className="text-[11px] font-black uppercase tracking-wide text-content-muted">Sin datos de diarios</div>
 </div>
 );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {data.map(j => {
        const sym = j.currency_symbol || "$";
        const fmtJ = n => `${sym}${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const journalColor = j.color || "#14b8a6";

        return (
          <div
            key={j.id}
            onClick={() => onSelectJournal && onSelectJournal(j)}
            className="group relative bg-white dark:bg-surface-dark-3 rounded-2xl p-5 border border-border/40 dark:border-white/10 shadow-sm hover:shadow-xl hover:border-brand-500/20 transition-all duration-300 overflow-hidden cursor-pointer"
          >
            {/* Color accent bar & background glow */}
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: journalColor }} />
            <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.03] -mr-16 -mt-16 rounded-full" style={{ background: journalColor }} />

            <div className="flex items-center justify-between mb-5 relative">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center border border-border/40 dark:border-white/10 bg-surface-2 dark:bg-white/5 shadow-inner group-hover:bg-brand-500/10 transition-colors">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} style={{ color: journalColor }}>
                      <path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                   </svg>
                </div>
                <div className="min-w-0">
                  <h4 className="text-[11px] font-black text-content dark:text-white uppercase tracking-widest truncate max-w-[140px]">
                    {j.name}
                  </h4>
                  {j.bank_name && (
                    <div className="text-[9px] font-bold text-content-subtle uppercase tracking-widest opacity-60 truncate max-w-[140px]">
                      {j.bank_name}
                    </div>
                  )}
                </div>
              </div>
              
              {j.currency_code && (
                <span className="text-[9px] font-black text-content-subtle bg-surface-2 dark:bg-white/5 px-2 py-0.5 rounded-lg border border-border/40 dark:border-white/5 uppercase tracking-tighter">
                  {j.currency_code}
                </span>
              )}
            </div>

            <div className="mb-5 relative">
              <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1">Saldo Acumulado</div>
              <div className="text-2xl font-black tracking-tighter tabular-nums" style={{ color: journalColor }}>
                {fmtJ(j.total_ingresos)}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border/20 dark:border-white/5 relative">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-0.5 opacity-60">Movimientos</span>
                <span className="text-xs font-black text-content dark:text-white tabular-nums">{j.tx_count} <span className="opacity-30">TX</span></span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-success/60 uppercase tracking-widest mb-0.5">Ingreso Hoy</span>
                <span className="text-xs font-black text-success tabular-nums">+{fmtJ(j.ingresos_hoy)}</span>
              </div>
            </div>

            {/* Subtle background decoration */}
            <div
              className="absolute -right-6 -bottom-6 w-24 h-24 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity pointer-events-none"
              style={{ color: journalColor }}
            >
              <svg fill="currentColor" viewBox="0 0 24 24" className="w-full h-full">
                <path d="M7 15h2c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1H7c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1zm0-8h10c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1-1s.45 1 1 1zm9 8h2c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1h-2c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1zm-4 0h2c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1h-2c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1z" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}
