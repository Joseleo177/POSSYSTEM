import { useState, useCallback, useEffect } from "react";
import JournalSummary from "./JournalSummary";
import { api } from "../../services/api";
import Page from "../ui/Page";
import DateRangePicker from "../ui/DateRangePicker";

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
        <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
            {/* Rango de Fechas (Simulando el ancho del buscador para simetría) */}
            <DateRangePicker 
                from={histDateFrom} 
                to={histDateTo} 
                setFrom={setHistDateFrom} 
                setTo={setHistDateTo}
                className="flex-1 min-w-[200px] max-w-md"
            />

            {/* Selector de Vista (Alineado a la derecha como los filtros) */}
            <div className="ml-auto flex items-center gap-1.5">
                {[
                    { id: "diarios", label: "Diarios", icon: <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /> },
                    { id: "bancos", label: "Bancos", icon: <path d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /> },
                    { id: "series", label: "Series", icon: <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> }
                ].map(v => (
                    <button
                        key={v.id}
                        onClick={() => setSummaryView(v.id)}
                        className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border transition-all ${summaryView === v.id ? 'bg-brand-500 text-black border-brand-500 shadow-lg shadow-brand-500/20' : 'bg-surface-2 dark:bg-white/5 border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white'}`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>{v.icon}</svg>
                        {v.label}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <Page module="MÓDULO CONTABLE" title="Ingresos y Facturación" subheader={subheader}>
            <div className="flex-1 min-h-0 overflow-auto p-4 custom-scrollbar">
                {summaryView === "diarios" && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="h-4 w-1.5 bg-brand-500 rounded-full" />
                            <span className="text-[11px] font-black uppercase tracking-widest text-content dark:text-white text-shadow-sm">Análisis de Distribución por Diarios</span>
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
                        <div className="flex flex-col items-center justify-center py-20 opacity-40">
                            <div className="text-[11px] font-black uppercase tracking-wide text-content-muted italic">Sin datos bancarios registrados en este rango</div>
                        </div>
                    );
                    return (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="h-4 w-1.5 bg-info rounded-full" />
                                <span className="text-[11px] font-black uppercase tracking-widest text-content dark:text-white">Distribución Consolidada por Bancos</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {entries.map(([bank, d]) => {
                                    const totalPagos = d.journals.reduce((s, j) => s + parseFloat(j.total_ingresos || 0), 0);
                                    const countPagos = d.journals.reduce((s, j) => s + parseInt(j.tx_count || 0), 0);
                                    const hoy = d.journals.reduce((s, j) => s + parseFloat(j.ingresos_hoy || 0), 0);
                                    const sym = d.journals[0]?.currency_symbol || "$";
                                    const fmtB = n => `${sym}${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                                    return (
                                        <div key={bank} className="group bg-white dark:bg-surface-dark-3 rounded-2xl p-5 border border-border/40 dark:border-white/10 shadow-sm hover:shadow-xl hover:border-info/30 transition-all duration-300 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-info/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-150 duration-500" />
                                            
                                            <div className="flex items-center gap-4 mb-5 relative">
                                                <div className="w-10 h-10 rounded-xl bg-info/10 text-info flex items-center justify-center shrink-0 shadow-inner">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-black text-content dark:text-white uppercase tracking-tight truncate">{bank}</div>
                                                    <div className="text-[10px] font-bold text-content-subtle uppercase tracking-widest opacity-60">Consolidado</div>
                                                </div>
                                            </div>

                                            <div className="mb-5 relative">
                                                <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1">Total Ingresos</div>
                                                <div className="text-2xl font-black text-info tracking-tighter tabular-nums">{fmtB(totalPagos)}</div>
                                            </div>

                                            <div className="flex flex-wrap gap-1.5 mb-5 relative">
                                                {d.journals.map(j => (
                                                    <span key={j.id} className="px-2 py-1 bg-surface-2 dark:bg-white/5 text-[9px] font-black text-content-subtle dark:text-white/40 rounded-lg border border-border/40 dark:border-white/5 uppercase tracking-tighter">
                                                        {j.name}
                                                    </span>
                                                ))}
                                            </div>

                                            <div className="flex justify-between items-end pt-4 border-t border-border/20 dark:border-white/5 relative">
                                                <div>
                                                    <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-0.5">Volumen</div>
                                                    <div className="text-xs font-black text-content dark:text-white tabular-nums">{countPagos} <span className="opacity-40">TX</span></div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-black text-success/60 uppercase tracking-widest mb-0.5">Hoy</div>
                                                    <div className="text-xs font-black text-success tabular-nums">+{fmtB(hoy)}</div>
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
                        <div className="flex flex-col items-center justify-center py-20 opacity-40">
                            <div className="text-[11px] font-black uppercase tracking-wide text-content-muted italic">Sin facturación emitida en este periodo</div>
                        </div>
                    );
                    return (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                             <div className="flex items-center gap-2 mb-4">
                                <div className="h-4 w-1.5 bg-brand-500 rounded-full" />
                                <span className="text-[11px] font-black uppercase tracking-widest text-content dark:text-white">Facturación por Series de Documentos</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {entries.map(([serie, d]) => (
                                    <div key={serie} className="bg-white dark:bg-surface-dark-3 border border-border/40 dark:border-white/10 rounded-2xl p-5 shadow-sm hover:border-brand-500/30 transition-all duration-300 group">
                                        <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-4 flex items-center justify-between">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                                                {serie}
                                            </span>
                                            <span className="opacity-20 group-hover:opacity-100 transition-opacity">#{d.prefix || 'S'}</span>
                                        </div>
                                        <div className="mb-5">
                                            <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1">Total Facturado</div>
                                            <div className="text-2xl font-black text-content dark:text-white tracking-tighter tabular-nums">{fmtPrice(d.total)}</div>
                                        </div>
                                        <div className="flex items-center gap-2 py-2 px-3 bg-surface-2 dark:bg-white/5 rounded-xl w-fit border border-border/30 dark:border-white/10 group-hover:bg-brand-500/10 transition-colors">
                                            <span className="text-xs font-black text-brand-500">{d.count}</span>
                                            <span className="text-[10px] font-black text-content-subtle dark:text-white/40 uppercase tracking-widest">Documentos</span>
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
