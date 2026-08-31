import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { fmtNumber, fmtInt, todayISO, toLocalISO } from "../../helpers";
import GlobalDateRangePicker from "../../components/ui/DateRangePicker";
import GlobalHourRangePicker from "../../components/ui/HourRangePicker";

// ── Helpers ───────────────────────────────────────────────────
export const fmt$ = (n) => `Ref. ${fmtNumber(n, 2)}`;
export const fmtN = (n) => fmtInt(n);
export const pct = (part, total) => total > 0 ? ((part / total) * 100).toFixed(1) : "0.0";
export const delta = (curr, prev) => prev > 0 ? (((curr - prev) / prev) * 100).toFixed(1) : null;

export const METHOD_COLORS = {
 efectivo: "bg-success", transferencia: "bg-info", banco: "bg-info",
 movil: "bg-violet-500", pago_movil: "bg-violet-500", zelle: "bg-warning",
 punto_venta: "bg-brand-500", otro: "bg-surface-3",
};

// ── Hook de reporte genérico ──────────────────────────────────
export function useReport(fetchFn, params, deps = []) {
 const [data, setData] = useState(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState(null);
 const load = useCallback(async () => {
 setLoading(true); setError(null);
 try { const r = await fetchFn(params); setData(r.data); }
 catch (e) { console.error(e); setError(e.message || "Error al cargar reporte"); }
 setLoading(false);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, deps);
 useEffect(() => { load(); }, [load]);
 return { data, loading, error, reload: load };
}

export function defaultRange(days = 30) {
 const t = todayISO();
 const d = new Date(); d.setDate(d.getDate() - days);
 return { from: toLocalISO(d), to: t };
}

// Franja horaria del reporte. Arranca vacía —todo el día, como siempre— y solo se manda al
// servidor cuando están las dos horas: con una sola no hay franja que aplicar.
export function useHourRange() {
 const [hours, setHours] = useState({ from: "", to: "" });
 const params = hours.from && hours.to && hours.from !== hours.to
   ? { hour_from: hours.from, hour_to: hours.to }
   : {};
 return {
   hours,
   setHours: (from, to) => setHours({ from, to }),
   params,
   // Para las deps de useReport: un string cambia de identidad solo si cambió la franja.
   key: `${params.hour_from || ""}-${params.hour_to || ""}`,
   activa: Boolean(params.hour_from),
   // Una franja que termina antes de empezar cruza la medianoche, y ahí el servidor imputa
   // la madrugada a la jornada anterior. Las pantallas lo dicen para que el corrimiento de
   // los días no se lea como un error.
   nocturna: Boolean(params.hour_from && params.hour_to < params.hour_from),
 };
}

// ── Export completo: pide el dataset sin límites antes de generar el Excel ──
export function useExportFull(fetchFn, params, build) {
 const [exporting, setExporting] = useState(false);
 const run = async () => {
 if (exporting) return;
 setExporting(true);
 try {
 const r = await fetchFn({ ...params, limit: 100000 });
 build(r.data);
 } catch (e) { console.error(e); }
 finally { setExporting(false); }
 };
 return { run, exporting };
}

// ── Componentes UI reutilizables ──────────────────────────────

export function DateRangePicker({ from, to, onChange }) {
 return <GlobalDateRangePicker from={from} to={to} onRangeChange={(f, t) => onChange(f, t)} />;
}

export function HourRangePicker({ from, to, onChange }) {
 return <GlobalHourRangePicker from={from} to={to} onChange={onChange} />;
}

// Aviso de jornada nocturna para la barra de filtros. Va junto a los selectores porque la
// pregunta ("¿por qué el sábado incluye la madrugada del domingo?") aparece mirando el
// filtro, no el pie de la tabla.
export function NightShiftNotice({ from, to }) {
 return (
   <div className="flex items-center gap-1.5 px-2.5 h-10 rounded-md border border-brand-500/20 bg-brand-500/5 shrink-0">
     <svg className="w-3 h-3 shrink-0 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
     </svg>
     <span className="text-[10px] font-bold uppercase tracking-tight text-brand-500 whitespace-nowrap">
       Jornada nocturna {from}–{to} · la madrugada cuenta en el día que abrió
     </span>
   </div>
 );
}

export function KpiCard({ label, value, sub, icon, color = "text-brand-500", delta: d }) {
 return (
 <div className="rounded-xl border border-border dark:border-white/5 bg-white dark:bg-white/5 p-3 flex flex-col gap-1 shadow-sm transition-all group overflow-auto">
 <div className="flex justify-between items-start">
 <div className="text-[11px] font-black text-content-muted dark:text-content-dark-muted uppercase tracking-wide leading-none">{label}</div>
 <span className="text-sm opacity-30">{icon}</span>
 </div>
 <div className={`text-xl font-black ${color} tracking-tight leading-none tabular-nums font-display`}>{value}</div>
 <div className="flex items-center justify-between gap-1 mt-0.5">
 {sub && <div className="text-[10px] font-bold text-content-muted dark:text-content-dark-muted opacity-60 truncate">{sub}</div>}
 {d !== null && d !== undefined && (
 <div className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${parseFloat(d) >= 0 ? "text-green-500 bg-green-500/10" : "text-danger bg-danger/10"}`}>
 {parseFloat(d) >= 0 ? "▲" : "▼"} {Math.abs(d)}%
 </div>
 )}
 </div>
 </div>
 );
}

export function SectionHeader({ title, sub }) {
 return (
 <div className="flex flex-col gap-0.5 mb-2">
 <div className="text-[11px] font-black text-brand-500 uppercase tracking-wide leading-none">
 {title}
 </div>
 {sub && <div className="text-[10px] font-bold text-content-muted dark:text-content-dark-muted opacity-60 uppercase tracking-tight">{sub}</div>}
 </div>
 );
}

export function Card({ children, className = "" }) {
 return (
 <div className={`bg-white dark:bg-white/5 rounded-xl border border-border dark:border-white/5 p-3 shadow-sm transition-all ${className}`}>
 {children}
 </div>
 );
}

export function Loading() {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-12 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin" />
 <div className="text-[11px] font-black text-content-muted dark:text-content-subtle uppercase tracking-wide">Cargando reporte...</div>
 </div>
 );
}

export function ExportButton({ onClick, loading = false }) {
 if (loading) {
 return (
 <button disabled
 className="shrink-0 whitespace-nowrap flex items-center gap-2 px-3 sm:px-4 py-2 text-[11px] font-black uppercase tracking-wide rounded-xl border border-green-500/30 text-green-500 bg-green-500/5 opacity-60 animate-pulse shadow-sm">
 <div className="w-4 h-4 shrink-0 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
 Generando...
 </button>
 );
 }
 return (
 // shrink-0 y whitespace-nowrap: compartiendo fila con el buscador y los filtros, el botón se
 // comprimía hasta partir "Exportar Excel" en dos líneas y quedaba el doble de alto que sus
 // vecinos. En pantallas estrechas la etiqueta se acorta en vez de envolverse.
 <button onClick={onClick} title="Exportar a Excel"
 className="shrink-0 whitespace-nowrap flex items-center gap-2 px-3 sm:px-4 py-2 text-[11px] font-black uppercase tracking-wide rounded-xl border border-green-500/30 text-green-500 bg-green-500/5 hover:bg-green-500 hover:text-white transition-all shadow-sm">
 <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
 </svg>
 <span className="hidden sm:inline">Exportar Excel</span>
 <span className="sm:hidden">Excel</span>
 </button>
 );
}

export function StockBadge({ qty, min }) {
 if (parseFloat(qty) <= 0) return <span className="text-[11px] font-black text-danger bg-danger/10 px-1.5 py-0.5 rounded border border-danger/20">SIN STOCK</span>;
 if (min > 0 && parseFloat(qty) < parseFloat(min)) return <span className="text-[11px] font-black text-warning bg-warning/10 px-1.5 py-0.5 rounded border border-warning/20">CRÍTICO</span>;
 return <span className="text-[11px] font-black text-success bg-success/10 px-1.5 py-0.5 rounded border border-success/20">OK</span>;
}

export function ProgressBar({ value, max, color = "bg-warning" }) {
 const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
 return (
 <div className="h-1.5 bg-surface-3 dark:bg-surface-dark-3 rounded-full overflow-auto">
 <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${w}%` }} />
 </div>
 );
}

// `series` dibuja varios tramos apilados por barra ([{ key, color, label }], de abajo
// hacia arriba); `yKey` + `color` siguen sirviendo para el caso de una sola serie.
export function BarChart({ data, xKey, yKey, series, color = "#fabd2f", height = 160 }) {
 const ref = useRef(null);
 const tramos = useMemo(
 () => (series?.length ? series : [{ key: yKey, color }]),
 [series, yKey, color]
 );
 useEffect(() => {
 if (!data?.length || !ref.current) return;
 const canvas = ref.current;
 const ctx = canvas.getContext("2d");
 const W = canvas.offsetWidth; const H = height;
 // Sin esto el canvas se rasteriza a 1x y las barras salen borrosas en pantallas retina.
 const dpr = window.devicePixelRatio || 1;
 canvas.width = W * dpr; canvas.height = H * dpr;
 ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
 const totalDe = d => tramos.reduce((t, s) => t + (parseFloat(d[s.key]) || 0), 0);
 const maxY = Math.max(...data.map(totalDe), 1);
 const pad = { top: 10, right: 10, bottom: 28, left: 55 };
 const cW = W - pad.left - pad.right;
 const cH = H - pad.top - pad.bottom;
 const slotW = cW / data.length;
 // Antes el ancho se topaba en 40px, así que con pocos días las barras quedaban
 // flotando en medio de slots enormes. Ahora llenan el slot menos una holgura.
 const barW = Math.max(3, Math.min(slotW - Math.min(12, slotW * 0.14), 120));
 ctx.clearRect(0, 0, W, H);
 for (let i = 0; i <= 4; i++) {
 const y = pad.top + (cH / 4) * i;
 ctx.strokeStyle = "rgba(150,150,150,0.1)"; ctx.lineWidth = 1;
 ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
 ctx.fillStyle = "rgba(150,150,150,0.6)"; ctx.font = "9px Inter,sans-serif"; ctx.textAlign = "right";
 const v = maxY * (1 - i / 4);
 ctx.fillText(v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0), pad.left - 4, y + 3);
 }
 data.forEach((d, i) => {
 const x = pad.left + i * slotW + (slotW - barW) / 2;
 let base = pad.top + cH;   // se apila de abajo hacia arriba
 tramos.forEach((s, si) => {
 const alto = ((parseFloat(d[s.key]) || 0) / maxY) * cH;
 if (alto <= 0) return;
 const y = base - alto;
 const grad = ctx.createLinearGradient(0, y, 0, base);
 grad.addColorStop(0, s.color + "cc"); grad.addColorStop(1, s.color + "22");
 ctx.fillStyle = grad;
 // Solo el tramo de más arriba lleva las esquinas redondeadas.
 const r = si === tramos.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0];
 ctx.beginPath(); ctx.roundRect(x, y, barW, alto, r); ctx.fill();
 base = y;
 });
 const step = Math.ceil(data.length / 10);
 if (i % step === 0) {
 ctx.fillStyle = "rgba(150,150,150,0.7)"; ctx.font = "8px Inter,sans-serif"; ctx.textAlign = "center";
 ctx.fillText(String(d[xKey]).slice(5), x + barW / 2, H - 8);
 }
 });
 }, [data, tramos, xKey, height]);
 return (
 <div>
  <canvas ref={ref} className="w-full" style={{ height }} />
  {tramos.length > 1 && (
  <div className="flex items-center justify-center gap-4 mt-2">
   {tramos.map(s => (
   <span key={s.key} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-content-subtle dark:text-white/40">
    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
    {s.label || s.key}
   </span>
   ))}
  </div>
  )}
 </div>
 );
}

export function usePagination(items = [], pageSize = 25) {
 const [page, setPage] = useState(1);
 const total = items.length;
 const totalPages = Math.max(1, Math.ceil(total / pageSize));
 const safePage = Math.min(page, totalPages);
 const paginated = items.slice((safePage - 1) * pageSize, safePage * pageSize);
 return { page: safePage, setPage, totalPages, total, paginated };
}

export function Pagination({ page, totalPages, total, onPage }) {
 if (totalPages <= 1) return null;
 return (
  <div className="shrink-0 px-4 py-2 border-t border-border dark:border-white/5 bg-surface-2/50 dark:bg-white/[0.02] flex items-center justify-between rounded-b-xl">
   <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest">
    Total: <span className="text-content dark:text-white">{total}</span>
   </div>
   <div className="flex items-center gap-1.5">
    <button disabled={page === 1} onClick={() => onPage(1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">«</button>
    <button disabled={page === 1} onClick={() => onPage(page - 1)} className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">Ant.</button>
    <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">Pág {page}/{totalPages}</div>
    <button disabled={page === totalPages} onClick={() => onPage(page + 1)} className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">Sig.</button>
    <button disabled={page === totalPages} onClick={() => onPage(totalPages)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">»</button>
   </div>
  </div>
 );
}

export function HeatmapHours({ data }) {
 if (!data?.length) return null;
 const maxRev = Math.max(...data.map(d => d.revenue), 1);
 return (
 <div>
 <div className="flex gap-1 items-end mb-1">
 {Array.from({ length: 24 }, (_, h) => {
 const row = data.find(d => parseInt(d.hour) === h);
 const rev = parseFloat(row?.revenue || 0);
 const intensity = rev / maxRev;
 return (
 <div key={h} className="flex-1 flex flex-col items-center" title={`${h}:00 — ${fmt$(rev)}`}>
 <div className="w-full rounded-sm" style={{ height: `${Math.max(4, intensity * 52)}px`, background: `rgba(250,189,47,${0.12 + intensity * 0.88})` }} />
 </div>
 );
 })}
 </div>
 <div className="flex gap-1 items-end">
 {Array.from({ length: 24 }, (_, h) => (
 <div key={h} className="flex-1 text-center">
 {h % 6 === 0 && <span className="text-[10px] text-content-subtle dark:text-content-dark-muted">{h}h</span>}
 </div>
 ))}
 </div>
 </div>
 );
}
