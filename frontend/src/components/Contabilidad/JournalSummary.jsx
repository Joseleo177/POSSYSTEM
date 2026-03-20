import { useState, useEffect } from "react";
import { api } from "../../services/api";

// ── Balance por diario (suma payments) ────────────────────────
export default function JournalSummary({ dateFrom, dateTo, onData }) {
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

  if (!data.length) return (
    <div className="flex flex-col items-center justify-center py-8 opacity-40">
      <div className="text-2xl mb-2">📊</div>
      <div className="text-[10px] font-black uppercase tracking-widest text-content-muted">Sin datos de diarios</div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {data.map(j => {
        const sym  = j.currency_symbol || "$";
        const fmtJ = n => `${sym}${Number(n).toFixed(2)}`;
        const journalColor = j.color || "#6366f1"; // Default to an indigo color
        
        return (
          <div 
            key={j.id} 
            className="group relative bg-white dark:bg-surface-dark-3 rounded-2xl p-5 border border-border dark:border-border-dark shadow-sm hover:shadow-card-md transition-all duration-300 overflow-hidden"
          >
            {/* Color accent bar */}
            <div 
              className="absolute top-0 left-0 w-full h-1.5 opacity-80"
              style={{ background: journalColor }}
            />
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div 
                  className="w-2.5 h-2.5 rounded-full shadow-sm animate-pulse" 
                  style={{ background: journalColor }} 
                />
                <h4 className="text-[11px] font-black text-content dark:text-content-dark uppercase tracking-wider truncate max-w-[120px]">
                  {j.name}
                </h4>
              </div>
              {j.currency_code && (
                <span className="text-[9px] font-bold text-content-subtle bg-surface-2 dark:bg-surface-dark px-2 py-0.5 rounded-md border border-border/50">
                  {j.currency_code}
                </span>
              )}
            </div>

            {j.bank_name && (
              <div className="flex items-center gap-1.5 text-[10px] text-content-muted font-medium mb-3">
                <span className="opacity-60">🏦</span> {j.bank_name}
              </div>
            )}

            <div className="mb-4">
              <div className="text-[10px] font-black text-content dark:text-content-dark uppercase tracking-[1.5px] mb-1 opacity-70">TOTAL ACUMULADO</div>
              <div className="text-2xl font-black tracking-tight" style={{ color: journalColor }}>
                {fmtJ(j.total_ingresos)}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/40 dark:border-border-dark/40">
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-content dark:text-content-dark uppercase tracking-widest opacity-60">Movimientos</span>
                <span className="text-sm font-bold text-content dark:text-content-dark">{j.tx_count} TX</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-black text-success uppercase tracking-widest">Hoy</span>
                <span className="text-sm font-bold text-success">{fmtJ(j.ingresos_hoy)}</span>
              </div>
            </div>

            {/* Subtle background decoration */}
            <div 
              className="absolute -right-4 -bottom-4 w-16 h-16 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity pointer-events-none"
              style={{ color: journalColor }}
            >
              <svg fill="currentColor" viewBox="0 0 24 24" className="w-full h-full">
                <path d="M7 15h2c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1H7c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1zm0-8h10c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1-1s.45 1 1 1zm9 8h2c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1h-2c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1zm-4 0h2c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1h-2c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1z"/>
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}
