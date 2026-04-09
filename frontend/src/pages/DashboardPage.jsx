import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../services/api";
import { fmtNumber, fmtInt } from "../helpers";

const fmt = (n, d = 2) => fmtNumber(n, d);
const fmtN = (n) => fmtInt(n);

function KpiCard({ label, value, sub, color = "text-warning" }) {
 return (
 <div className="bg-surface-2 dark:bg-white/[0.04] border border-border/30 dark:border-white/5 rounded-lg p-3">
 <div className="text-[9px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 mb-2">{label}</div>
 <div className={`text-sm font-black tabular-nums leading-none ${color} mb-1`}>{value}</div>
 {sub && <div className="text-[10px] text-content-subtle dark:text-white/20 font-medium">{sub}</div>}
 </div>
 );
}

function SalesChart({ data }) {
 const canvasRef = useRef(null);
 useEffect(() => {
 if (!data?.length || !canvasRef.current) return;
 const canvas = canvasRef.current;
 const ctx = canvas.getContext("2d");
 const W = canvas.offsetWidth; const H = canvas.offsetHeight;
 canvas.width = W; canvas.height = H;
 const maxRev = Math.max(...data.map(d => d.revenue), 1);
 const pad = { top: 16, right: 12, bottom: 32, left: 48 };
 const chartW = W - pad.left - pad.right;
 const chartH = H - pad.top - pad.bottom;
 const barW = Math.max(3, chartW / data.length - 3);
 ctx.clearRect(0, 0, W, H);
 ctx.strokeStyle = "rgba(200,200,200,0.08)"; ctx.lineWidth = 1;
 for (let i = 0; i <= 4; i++) {
 const y = pad.top + (chartH / 4) * i;
 ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
 ctx.fillStyle = "rgba(200,200,200,0.4)";
 ctx.font = "9px Inter, sans-serif"; ctx.textAlign = "right";
 ctx.fillText(fmt(maxRev * (1 - i / 4), 0), pad.left - 5, y + 3);
 }
 data.forEach((d, i) => {
 const x = pad.left + i * (chartW / data.length) + (chartW / data.length - barW) / 2;
 const barH = (d.revenue / maxRev) * chartH;
 const y = pad.top + chartH - barH;
 const grad = ctx.createLinearGradient(0, y, 0, pad.top + chartH);
 grad.addColorStop(0, "rgba(250, 189, 47, 0.9)");
 grad.addColorStop(1, "rgba(250, 189, 47, 0.1)");
 ctx.fillStyle = grad;
 ctx.beginPath(); ctx.roundRect(x, y, barW, barH, 2); ctx.fill();
 if (i % 5 === 0) {
 const d_ = new Date(d.day + "T12:00:00");
 ctx.fillStyle = "rgba(200,200,200,0.5)";
 ctx.font = "9px Inter, sans-serif"; ctx.textAlign = "center";
 ctx.fillText(`${d_.getDate()}/${d_.getMonth() + 1}`, x + barW / 2, H - pad.bottom + 14);
 }
 });
 }, [data]);
 return (
 <div className="bg-surface-2 dark:bg-white/[0.04] border border-border/30 dark:border-white/5 rounded-lg p-3 flex flex-col">
 <div className="text-[9px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 mb-2">Ventas últimos 30 días</div>
 <canvas ref={canvasRef} style={{ width: "100%", height: "140px", display: "block" }} />
 </div>
 );
}

export default function DashboardPage() {
 const [data, setData] = useState(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(null);

 const load = useCallback(async () => {
 setLoading(true);
 try { const res = await api.dashboard.get(); setData(res.data); }
 catch (e) { setError(e.message); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { load(); }, [load]);

 if (loading) return (
 <div className="h-full flex items-center justify-center">
 <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/20 animate-pulse">Cargando dashboard…</div>
 </div>
 );
 if (error) return (
 <div className="h-full flex items-center justify-center text-danger text-[11px] font-black uppercase">{error}</div>
 );

 const { kpi, top_products, sales_by_day, pending_bills, low_stock, new_customers, purchases_month } = data;

 return (
 <div className="h-full flex flex-col animate-in fade-in duration-500">

 {/* Header */}
 <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between border-b border-border/30 dark:border-white/5">
 <div>
 <div className="text-[10px] font-black text-brand-500 uppercase tracking-wide leading-none mb-0.5">PANEL DE CONTROL</div>
 <h1 className="text-sm font-black text-content dark:text-white uppercase tracking-tight leading-none">Dashboard</h1>
 </div>
 <div className="flex items-center gap-3">
 <span className="text-[10px] font-bold text-content-subtle dark:text-white/30">
 {new Date().toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short" })}
 </span>
 <button onClick={load} className="px-2.5 py-1 bg-surface-2 dark:bg-white/5 border border-border/30 dark:border-white/5 rounded-lg text-[10px] font-black uppercase tracking-wide hover:text-brand-500 transition-all active:scale-95">
 ↻ Actualizar
 </button>
 </div>
 </div>

 {/* Content */}
 <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">

 {/* KPI — Hoy */}
 <div>
 <div className="text-[10px] font-black text-content-subtle dark:text-white/20 uppercase tracking-wide mb-1.5">HOY</div>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 <KpiCard label="Ventas hoy" value={fmtN(kpi.today.sales)} sub={`$${fmt(kpi.today.revenue)}`} color="text-warning" />
 <KpiCard label="Ingresos hoy" value={`$${fmt(kpi.today.revenue)}`} sub="facturado" color="text-success" />
 <KpiCard label="Ctas. por cobrar" value={fmtN(pending_bills.count)} sub={`$${fmt(pending_bills.balance)} pendiente`} color="text-danger" />
 <KpiCard label="Alertas de stock" value={fmtN(low_stock.length)} sub="productos bajo mínimo" color="text-danger" />
 </div>
 </div>

 {/* KPI — 30 días */}
 <div>
 <div className="text-[10px] font-black text-content-subtle dark:text-white/20 uppercase tracking-wide mb-1.5">ÚLTIMOS 30 DÍAS</div>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 <KpiCard label="Ventas (30d)" value={fmtN(kpi.month.sales)} sub={`$${fmt(kpi.month.revenue)}`} color="text-info" />
 <KpiCard label="Ingresos (30d)" value={`$${fmt(kpi.month.revenue)}`} sub="facturado" color="text-success" />
 <KpiCard label="Compras (30d)" value={fmtN(purchases_month.count)} sub={`$${fmt(purchases_month.total)}`} color="text-warning" />
 <KpiCard label="Nuevos clientes" value={fmtN(new_customers)} sub="este mes" color="text-info" />
 </div>
 </div>

 {/* Chart + Top */}
 <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-2">
 <SalesChart data={sales_by_day} />
 <div className="bg-surface-2 dark:bg-white/[0.04] border border-border/30 dark:border-white/5 rounded-lg p-3">
 <div className="text-[9px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 mb-2.5">TOP PRODUCTOS (30 DÍAS)</div>
 {top_products.length === 0
 ? <div className="text-[10px] text-content-subtle dark:text-white/20 text-center py-4">Sin datos</div>
 : <div className="space-y-2.5">
 {top_products.map((p, i) => {
 const pct = Math.round((p.total_qty / (top_products[0]?.total_qty || 1)) * 100);
 return (
 <div key={p.product_id}>
 <div className="flex justify-between text-[10px] mb-1">
 <span className="font-bold text-content dark:text-content-dark truncate mr-2">
 <span className="text-warning mr-1">#{i + 1}</span>{p.name}
 </span>
 <span className="text-content-subtle dark:text-white/30 whitespace-nowrap tabular-nums">{fmt(p.total_qty, 0)} uds</span>
 </div>
 <div className="h-1 bg-surface-3 dark:bg-white/5 rounded-full overflow-hidden">
 <div className="h-full bg-warning rounded-full" style={{ width: `${pct}%` }} />
 </div>
 </div>
 );
 })}
 </div>
 }
 </div>
 </div>

 {/* Stock bajo */}
 {low_stock.length > 0 && (
 <div className="bg-surface-2 dark:bg-white/[0.04] border border-danger/20 rounded-lg p-3">
 <div className="text-[9px] font-black text-danger uppercase tracking-wide mb-2">STOCK BAJO — REQUIERE ATENCIÓN</div>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
 {low_stock.map(p => (
 <div key={p.id} className="flex items-center justify-between bg-surface-1 dark:bg-white/5 border border-danger/10 rounded-lg px-3 py-2">
 <div>
 <div className="text-[11px] font-bold text-content dark:text-content-dark">{p.name}</div>
 <div className="text-[9px] text-content-subtle dark:text-white/30">Mín: {fmt(p.min_stock, 0)} {p.unit}</div>
 </div>
 <div className="text-right">
 <div className="text-danger font-black text-sm tabular-nums">{fmt(p.stock, 0)}</div>
 <div className="text-[10px] text-content-subtle dark:text-white/30">{p.unit}</div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 </div>
 );
}
