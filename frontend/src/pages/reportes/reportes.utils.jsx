import { useState, useEffect, useCallback, useRef } from "react";
import { fmtNumber, fmtInt, todayISO } from "../../helpers";

// ── Helpers ───────────────────────────────────────────────────
export const fmt$ = (n) => `$${fmtNumber(n, 2)}`;
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
 return { from: d.toISOString().slice(0, 10), to: t };
}

// ── Componentes UI reutilizables ──────────────────────────────

export function DateRangePicker({ from, to, onChange }) {
 const presets = [
 { label: "Hoy", days: 0 },
 { label: "7 d", days: 7 },
 { label: "30 d", days: 30 },
 ];
 const applyPreset = (days) => {
 const t = todayISO();
 if (days === 0) { onChange(t, t); return; }
 const d = new Date(); d.setDate(d.getDate() - days);
 onChange(d.toISOString().slice(0, 10), t);
 };
 return (
 <div className="flex items-center gap-3 shrink-0">
 <div className="flex gap-1">
 {presets.map(p => (
 <button key={p.label} onClick={() => applyPreset(p.days)}
 className="px-2 py-1 text-[11px] font-black uppercase tracking-wide rounded-md border border-border dark:border-white/5 bg-surface-3 dark:bg-white/5 text-content-muted dark:text-content-dark-muted hover:border-brand-500 hover:text-brand-500 transition-all">
 {p.label}
 </button>
 ))}
 </div>
 <div className="flex items-center gap-2">
 <input type="date" value={from} onChange={e => onChange(e.target.value, to)}
 className="bg-surface-3 dark:bg-white/5 border border-border dark:border-white/5 text-[11px] font-black rounded-md py-1 px-2 text-content dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20" />
 <span className="text-content-subtle dark:text-white/20">→</span>
 <input type="date" value={to} onChange={e => onChange(from, e.target.value)}
 className="bg-surface-3 dark:bg-white/5 border border-border dark:border-white/5 text-[11px] font-black rounded-md py-1 px-2 text-content dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20" />
 </div>
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

export function ExportButton({ onClick }) {
 return (
 <button onClick={onClick}
 className="flex items-center gap-2 px-4 py-2 text-[11px] font-black uppercase tracking-wide rounded-xl border border-green-500/30 text-green-500 bg-green-500/5 hover:bg-green-500 hover:text-white transition-all shadow-sm">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
 </svg>
 Exportar Excel
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

export function BarChart({ data, xKey, yKey, color = "#fabd2f", height = 160 }) {
 const ref = useRef(null);
 useEffect(() => {
 if (!data?.length || !ref.current) return;
 const canvas = ref.current;
 const ctx = canvas.getContext("2d");
 const W = canvas.offsetWidth; const H = height;
 canvas.width = W; canvas.height = H;
 const maxY = Math.max(...data.map(d => parseFloat(d[yKey]) || 0), 1);
 const pad = { top: 10, right: 10, bottom: 28, left: 55 };
 const cW = W - pad.left - pad.right;
 const cH = H - pad.top - pad.bottom;
 const slotW = cW / data.length;
 const barW = Math.min(40, Math.max(3, slotW - 3));
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
 const barH = ((parseFloat(d[yKey]) || 0) / maxY) * cH;
 const y = pad.top + cH - barH;
 const grad = ctx.createLinearGradient(0, y, 0, pad.top + cH);
 grad.addColorStop(0, color + "cc"); grad.addColorStop(1, color + "22");
 ctx.fillStyle = grad;
 ctx.beginPath(); ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]); ctx.fill();
 const step = Math.ceil(data.length / 10);
 if (i % step === 0) {
 ctx.fillStyle = "rgba(150,150,150,0.7)"; ctx.font = "8px Inter,sans-serif"; ctx.textAlign = "center";
 ctx.fillText(String(d[xKey]).slice(5), x + barW / 2, H - 8);
 }
 });
 }, [data, yKey, xKey, color, height]);
 return <canvas ref={ref} className="w-full" style={{ height }} />;
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
