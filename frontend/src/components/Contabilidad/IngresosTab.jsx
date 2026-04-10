import { useState, useCallback, useEffect } from "react";
import JournalSummary from "./JournalSummary";
import { api } from "../../services/api";
import Page from "../ui/Page";

export default function IngresosTab({ notify, fmtPrice, allSeries }) {
 const [histDateFrom, setHistDateFrom] = useState("");
 const [histDateTo, setHistDateTo] = useState("");
 const [summaryView, setSummaryView] = useState("diarios");
 const [journalSummData, setJournalSummData] = useState([]);
 const [sales, setSales] = useState([]);

 const loadSalesForSummary = useCallback(async () => {
 try {
 const params = {};
 if (histDateFrom) params.date_from = histDateFrom;
 if (histDateTo) params.date_to = histDateTo;
 const r = await api.sales.getAll(params);
 setSales(r.data);
 } catch (e) { notify(e.message, "err"); }
 }, [histDateFrom, histDateTo, notify]);

 useEffect(() => { loadSalesForSummary(); }, [loadSalesForSummary]);

  const subheader = (
    <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 bg-surface-1/50 dark:bg-white/[0.01]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-black text-content-subtle uppercase tracking-wide">Periodo:</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={histDateFrom}
              onChange={e => setHistDateFrom(e.target.value)}
              className="input h-7 text-[11px] w-36"
            />
            <span className="text-content-subtle opacity-40 font-black">→</span>
            <input
              type="date"
              value={histDateTo}
              onChange={e => setHistDateTo(e.target.value)}
              className="input h-7 text-[11px] w-36"
            />
          </div>
        </div>
        <div className="flex gap-1">
          {[
            { id: "diarios", label: "Diarios" },
            { id: "bancos", label: "Bancos" },
            { id: "series", label: "Series" }
          ].map(v => (
            <button
              key={v.id}
              onClick={() => setSummaryView(v.id)}
              className={[
                "px-4 py-1.5 rounded-md text-[11px] font-black uppercase tracking-wide transition-all",
                summaryView === v.id
                  ? "bg-brand-500 text-black shadow-sm"
                  : "text-content-muted dark:text-content-dark-muted hover:text-content dark:hover:text-white hover:bg-surface-3 dark:hover:bg-white/10",
              ].join(" ")}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Page module="MÓDULO CONTABLE" title="Ingresos y Facturación" subheader={subheader}>
      <div className="flex-1 min-h-0 card-premium p-4 overflow-auto">
 {summaryView === "diarios" && (
 <div>
 <div className="flex items-center gap-2 mb-3">
 <div className="h-3 w-1 bg-brand-500 rounded-md" />
 <span className="text-[11px] font-black uppercase tracking-wide text-content dark:text-white">Distribución por Diarios</span>
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
 if (!byBank[key]) byBank[key] = { journals: [] };
 byBank[key].journals.push(j);
 });
 const entries = Object.entries(byBank);
 if (!entries.length) return (
 <div className="flex flex-col items-center justify-center py-12 opacity-40">
 <div className="text-[11px] font-black uppercase tracking-wide text-content-muted">Sin datos bancarios en este periodo</div>
 </div>
 );
 return (
 <div>
 <div className="flex items-center gap-2 mb-3">
 <div className="h-3 w-1 bg-info rounded-md" />
 <span className="text-[11px] font-black uppercase tracking-wide text-content dark:text-white">Distribución por Bancos</span>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
 {entries.map(([bank, d]) => {
 const totalPagos = d.journals.reduce((s, j) => s + parseFloat(j.total_ingresos || 0), 0);
 const countPagos = d.journals.reduce((s, j) => s + parseInt(j.tx_count || 0), 0);
 const hoy = d.journals.reduce((s, j) => s + parseFloat(j.ingresos_hoy || 0), 0);
 const sym = d.journals[0]?.currency_symbol || "$";
 const fmtB = n => `${sym}${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

 return (
 <div key={bank} className="bg-white dark:bg-surface-dark-3 rounded-lg p-4 border border-border dark:border-border-dark shadow-sm">
 <div className="flex items-center gap-3 mb-3">
 <div className="w-8 h-8 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>
 </div>
 <div>
 <div className="text-xs font-black text-content dark:text-white uppercase tracking-wide">{bank}</div>
 <div className="text-[11px] font-bold text-content-muted uppercase tracking-wide">Consolidado Bancario</div>
 </div>
 </div>

 <div className="mb-3">
 <div className="text-[11px] font-black text-content-muted uppercase tracking-wide mb-0.5">Total acumulado</div>
 <div className="text-xl font-black text-info tracking-tight">{fmtB(totalPagos)}</div>
 </div>

 <div className="flex flex-wrap gap-1.5 mb-3">
 {d.journals.map(j => (
 <span key={j.id} className="px-2.5 py-1 bg-surface-2 dark:bg-white/5 text-[11px] font-black text-content dark:text-white rounded-lg border border-border/40 dark:border-white/10">
 {j.name}
 </span>
 ))}
 </div>

 <div className="flex justify-between items-center pt-2.5 border-t border-border/20 dark:border-white/5">
 <div>
 <div className="text-[11px] font-black text-content-muted uppercase tracking-wide">Total TX</div>
 <div className="text-xs font-black text-content dark:text-white">{countPagos} pagos</div>
 </div>
 <div className="text-right">
 <div className="text-[11px] font-black text-success uppercase tracking-wide">Hoy</div>
 <div className="text-xs font-black text-success">{fmtB(hoy)}</div>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 );
 })()}

 {summaryView === "series" && (() => {
 const bySerie = {};
 sales.forEach(s => {
 const key = s.serie_name || "Sin serie";
 if (!bySerie[key]) bySerie[key] = { count: 0, total: 0, prefix: s.serie_prefix || "" };
 bySerie[key].count++;
 bySerie[key].total += parseFloat(s.total || 0);
 });
 const entries = Object.entries(bySerie);
 if (!entries.length) return (
 <div className="flex flex-col items-center justify-center py-12 opacity-40">
 <div className="text-[11px] font-black uppercase tracking-wide text-content-muted">Sin facturación emitida en este periodo</div>
 </div>
 );
 return (
 <div>
 <div className="flex items-center gap-2 mb-3">
 <div className="h-3 w-1 bg-brand-500 rounded-md" />
 <span className="text-[11px] font-black uppercase tracking-wide text-content dark:text-white">Distribución por Series</span>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
 {entries.map(([serie, d]) => (
 <div key={serie} className="bg-white dark:bg-surface-dark-3 border border-brand-500/20 rounded-lg p-4 shadow-sm">
 <div className="text-[11px] font-black text-brand-500 uppercase tracking-wide mb-3 flex items-center gap-2">
 <span className="w-1.5 h-1.5 rounded-md bg-brand-500 shrink-0" />
 {serie}
 </div>
 <div className="mb-3">
 <div className="text-[11px] font-black text-content-muted uppercase tracking-wide mb-0.5">Total Facturado</div>
 <div className="text-xl font-black text-content dark:text-white tracking-tight">{fmtPrice(d.total)}</div>
 </div>
 <div className="flex items-center gap-2 py-1.5 px-3 bg-surface-2 dark:bg-white/5 rounded-lg w-fit border border-border/30 dark:border-white/10">
 <span className="text-xs font-black text-brand-500">{d.count}</span>
 <span className="text-[11px] font-black text-content-muted uppercase tracking-wide">Documentos</span>
 </div>
 </div>
 ))}
 </div>
 </div>
 );
 })()}
      </div>
    </Page>
  );
}
