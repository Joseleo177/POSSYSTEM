import { useState, useCallback, useEffect } from "react";
import JournalSummary from "./JournalSummary";
import { api } from "../../services/api";

export default function IngresosTab({ notify, fmtPrice, allSeries }) {
  const [histDateFrom,  setHistDateFrom]  = useState("");
  const [histDateTo,    setHistDateTo]    = useState("");
  const [summaryView,     setSummaryView]     = useState("diarios");
  const [journalSummData, setJournalSummData] = useState([]);
  const [sales,           setSales]           = useState([]);

  const loadSalesForSummary = useCallback(async () => {
    try {
      const params = {};
      if (histDateFrom) params.date_from = histDateFrom;
      if (histDateTo)   params.date_to   = histDateTo;
      const r = await api.sales.getAll(params);
      setSales(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [histDateFrom, histDateTo, notify]);

  useEffect(() => { loadSalesForSummary(); }, [loadSalesForSummary]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── FILTROS DE RESUMEN ── */}
      <div className="bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl p-6 mb-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex-1 w-full max-w-lg">
            <div className="text-[10px] font-black text-brand-500 uppercase tracking-[2px] mb-3 ml-1">Periodo de Análisis</div>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 w-full">
                <span className="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1 mb-1 block opacity-50">Desde</span>
                <input 
                  type="date" 
                  value={histDateFrom} 
                  onChange={e => setHistDateFrom(e.target.value)}
                  className="w-full bg-surface-2 dark:bg-surface-dark border-none py-2.5 px-4 rounded-xl text-xs font-bold focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
                />
              </div>
              <div className="hidden sm:flex items-center pt-5 text-content-subtle font-black opacity-30">→</div>
              <div className="flex-1 w-full">
                <span className="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1 mb-1 block opacity-50">Hasta</span>
                <input 
                  type="date" 
                  value={histDateTo} 
                  onChange={e => setHistDateTo(e.target.value)}
                  className="w-full bg-surface-2 dark:bg-surface-dark border-none py-2.5 px-4 rounded-xl text-xs font-bold focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-2 bg-surface-2 dark:bg-surface-dark-3 p-1.5 rounded-2xl border border-border/50 w-full md:w-auto">
            {[
              { id: "diarios", label: "Diarios", icon: "📖" },
              { id: "bancos", label: "Bancos", icon: "🏦" },
              { id: "series", label: "Series", icon: "🎫" }
            ].map(v => (
              <button 
                key={v.id} 
                onClick={() => setSummaryView(v.id)}
                className={[
                  "flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  summaryView === v.id
                    ? "bg-brand-500 text-black shadow-lg shadow-brand-500/20"
                    : "text-content-subtle hover:text-content hover:bg-white/50 dark:hover:bg-white/5",
                ].join(" ")}
              >
                <span className="text-xs">{v.icon}</span>
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENIDO DE RESUMEN ── */}
      <div className="bg-surface-2/40 dark:bg-surface-dark-2/40 rounded-[2.5rem] p-8 min-h-[400px] border border-border/40 dark:border-border-dark/40 shadow-inner">
        <div className="animate-in fade-in zoom-in-95 duration-500">
          
          {summaryView === "diarios" && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 ml-2 mb-6">
                <div className="h-4 w-1 bg-brand-500 rounded-full" />
                <span className="text-[11px] font-black uppercase tracking-[2px] text-content">Distribución por Diarios</span>
              </div>
              <JournalSummary 
                dateFrom={histDateFrom} 
                dateTo={histDateTo} 
                onData={setJournalSummData} 
              />
            </div>
          )}

          {summaryView === "bancos" && (() => {
            const byBank = {};
            journalSummData.forEach(j => {
              const key = j.bank_name || "Sin banco";
              if (!byBank[key]) byBank[key] = { journals:[] };
              byBank[key].journals.push(j);
            });
            const entries = Object.entries(byBank);
            if (!entries.length) return (
              <div className="flex flex-col items-center justify-center py-20 opacity-40">
                <div className="text-4xl mb-4">🏦</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-content-muted">Sin datos bancarios en este periodo</div>
              </div>
            );
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {entries.map(([bank, d]) => {
                  const totalPagos = d.journals.reduce((s,j) => s + parseFloat(j.total_ingresos||0), 0);
                  const countPagos = d.journals.reduce((s,j) => s + parseInt(j.tx_count||0), 0);
                  const hoy        = d.journals.reduce((s,j) => s + parseFloat(j.ingresos_hoy||0), 0);
                  const sym = d.journals[0]?.currency_symbol || "$";
                  const fmtB = n => `${sym}${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  
                  return (
                    <div key={bank} className="group bg-white dark:bg-surface-dark-3 rounded-[2rem] p-7 border border-border/80 dark:border-border-dark shadow-sm hover:shadow-card-lg transition-all duration-300">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-info/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                          🏦
                        </div>
                        <div>
                          <div className="text-[12px] font-black text-content uppercase tracking-wider mb-0.5">{bank}</div>
                          <div className="text-[9px] font-bold text-content-subtle uppercase tracking-widest opacity-60">Consolidado Bancario</div>
                        </div>
                      </div>
                      
                      <div className="mb-6">
                        <div className="text-[11px] font-black text-content dark:text-content-dark uppercase tracking-[1.5px] mb-2 pl-1 opacity-70">Saldo acumulado</div>
                        <div className="text-3xl font-black text-info tracking-tighter drop-shadow-sm">{fmtB(totalPagos)}</div>
                      </div>

                      <div className="p-4 bg-surface-2 dark:bg-surface-dark-4 rounded-2xl mb-6">
                        <div className="text-[9px] font-black text-content dark:text-content-dark uppercase tracking-widest mb-3 opacity-60">Cuentas vinculadas</div>
                        <div className="flex flex-wrap gap-2">
                          {d.journals.map(j => (
                            <span key={j.id} className="px-3 py-1.5 bg-white dark:bg-surface-dark text-[10px] font-bold text-content dark:text-content-dark rounded-xl border border-border/60">
                              {j.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-5 border-t border-border/20">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-content dark:text-content-dark uppercase tracking-widest opacity-60">Total TX</span>
                          <span className="text-[12px] font-black text-content dark:text-content-dark opacity-90">{countPagos} pagos</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] font-black text-success uppercase tracking-widest block mb-1">Cierre Hoy</span>
                          <div className="text-[12px] font-black text-success bg-success/10 px-4 py-1.5 rounded-full">{fmtB(hoy)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {summaryView === "series" && (() => {
            const bySerie = {};
            sales.forEach(s => {
              const key = s.serie_name || "Sin serie";
              if (!bySerie[key]) bySerie[key] = { count:0, total:0, prefix: s.serie_prefix || "" };
              bySerie[key].count++;
              bySerie[key].total += parseFloat(s.total||0);
            });
            const entries = Object.entries(bySerie);
            if (!entries.length) return (
              <div className="flex flex-col items-center justify-center py-20 opacity-40">
                <div className="text-4xl mb-4">🎫</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-content-muted">Sin facturación emitida en este periodo</div>
              </div>
            );
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {entries.map(([serie, d]) => (
                  <div key={serie} className="group bg-white dark:bg-surface-dark-3 border border-brand-500/20 rounded-3xl p-6 shadow-sm hover:shadow-card-md transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-125 transition-transform pointer-events-none">
                      <span className="text-4xl text-brand-500">🎫</span>
                    </div>
                    
                    <div className="text-[11px] font-black text-brand-400 uppercase tracking-[2px] mb-4 flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                       {serie}
                    </div>
                    
                    <div className="mb-6">
                      <div className="text-[11px] font-black text-content dark:text-content-dark uppercase tracking-widest mb-2 opacity-60">Total Facturado</div>
                      <div className="text-3xl font-black text-content dark:text-content-dark tracking-tighter">{fmtPrice(d.total)}</div>
                    </div>
                    
                    <div className="flex items-center gap-3 py-2.5 px-4 bg-white dark:bg-surface-dark-4 rounded-2xl w-fit shadow-sm border border-border/40">
                      <span className="text-[12px] font-black text-brand-500">{d.count}</span>
                      <span className="text-[10px] font-black text-content dark:text-content-dark uppercase tracking-widest opacity-80">Documentos</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}
