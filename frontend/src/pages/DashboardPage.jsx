import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../services/api";
import { fmtNumber, fmtInt } from "../helpers";

import Page from "../components/ui/Page";

const fmt = (n, d = 2) => fmtNumber(n, d);
const fmtN = (n) => fmtInt(n);

function SalesChart({ data }) {
    const canvasRef = useRef(null);
    useEffect(() => {
        if (!data?.length || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const W = canvas.offsetWidth; const H = canvas.offsetHeight;
        canvas.width = W; canvas.height = H;
        const maxRev = Math.max(...data.map(d => d.revenue), 1);
        const pad = { top: 20, right: 10, bottom: 25, left: 40 };
        const chartW = W - pad.left - pad.right;
        const chartH = H - pad.top - pad.bottom;
        const slotW = chartW / data.length;
        const barW = Math.min(30, Math.max(4, slotW - 6));

        ctx.clearRect(0, 0, W, H);
        
        // Guías horizontales
        ctx.strokeStyle = "rgba(200,200,200,0.05)"; ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        for (let i = 0; i <= 4; i++) {
            const y = pad.top + (chartH / 4) * i;
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
            ctx.fillStyle = "rgba(150,150,150,0.5)";
            ctx.font = "9px Inter, sans-serif"; ctx.textAlign = "right";
            ctx.fillText(fmt(maxRev * (1 - i / 4), 0), pad.left - 8, y + 3);
        }
        ctx.setLineDash([]);

        // Barras
        data.forEach((d, i) => {
            const x = pad.left + i * slotW + (slotW - barW) / 2;
            const barH = (d.revenue / maxRev) * chartH;
            const y = pad.top + chartH - barH;
            
            const grad = ctx.createLinearGradient(0, y, 0, pad.top + chartH);
            grad.addColorStop(0, "rgba(250, 189, 47, 0.8)");
            grad.addColorStop(1, "rgba(250, 189, 47, 0.05)");
            
            ctx.fillStyle = grad;
            ctx.beginPath(); 
            // Top redondeado
            const radius = 3;
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + barW - radius, y);
            ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
            ctx.lineTo(x + barW, pad.top + chartH);
            ctx.lineTo(x, pad.top + chartH);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.fill();

            // Labels cada 5 días
            if (i % 5 === 0) {
                const d_ = new Date(d.day + "T12:00:00");
                ctx.fillStyle = "rgba(150,150,150,0.6)";
                ctx.font = "black 9px Inter, sans-serif"; ctx.textAlign = "center";
                ctx.fillText(`${d_.getDate()}/${d_.getMonth() + 1}`, x + barW / 2, H - 5);
            }
        });
    }, [data]);

    return <canvas ref={canvasRef} className="w-full h-48 block" />;
}

function KpiCard({ label, value, sub, subValue, color = "text-brand-500", icon }) {
    return (
        <div className="bg-white dark:bg-surface-dark-3 border border-border/40 dark:border-white/10 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-16 h-16 opacity-[0.03] -mr-4 -mt-4 rounded-full bg-current ${color}`} />
            <div className="flex items-center gap-3 mb-3 relative">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 text-[11px] ${color}`}>
                    {icon}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle opacity-60 truncate">{label}</div>
            </div>
            <div className={`text-xl font-black tabular-nums tracking-tighter mb-1 ${color}`}>{value}</div>
            {sub && (
                <div className="flex items-center justify-between text-[9px] font-bold text-content-subtle uppercase tracking-widest border-t border-border/10 pt-2 opacity-50">
                    <span>{label === "Alertas" ? "Estado" : "Volumen"}</span>
                    <span className="text-content dark:text-white tabular-nums">{subValue} {sub}</span>
                </div>
            )}
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
        <div className="h-full flex flex-col items-center justify-center gap-4 bg-surface-1 dark:bg-surface-dark-1">
            <div className="w-12 h-12 rounded-2xl border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
            <div className="text-[11px] font-black uppercase tracking-widest text-content-subtle animate-pulse">Analizando Datos del Sistema...</div>
        </div>
    );

    if (error) return (
        <div className="h-full flex items-center justify-center p-6 text-center">
            <div className="max-w-md">
                <div className="text-danger text-4xl mb-4">⚠️</div>
                <div className="text-sm font-black text-content dark:text-white uppercase mb-2">Error de Sincronización</div>
                <p className="text-xs text-content-subtle mb-6">{error}</p>
                <button onClick={load} className="btn-primary px-6 h-10 rounded-xl">Reintentar Conexión</button>
            </div>
        </div>
    );

    const { kpi, top_products, sales_by_day, pending_bills, low_stock, purchases_month } = data;

    return (
        <Page module="ORDEN DE CONTROL" title="Inteligencia de Negocio" subheader={
            <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex items-center justify-between bg-surface-1/50 dark:bg-white/[0.01]">
                 <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-success animate-pulse" />
                     <span className="text-[10px] font-black text-content dark:text-white uppercase tracking-widest">Servidor Activo · {new Date().toLocaleDateString("es-VE", { day: "numeric", month: "long" })}</span>
                 </div>
                 <button onClick={load} className="h-8 px-4 rounded-lg bg-surface-2 dark:bg-white/5 border border-border/30 dark:border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all">
                    ↻ Actualizar Métricas
                 </button>
            </div>
        }>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-5 space-y-6">
                
                {/* ── Sección Financiera Crítica ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard 
                        label="Facturación Hoy" 
                        value={`$${fmt(kpi.today.revenue)}`} 
                        sub="TX" 
                        subValue={kpi.today.sales} 
                        color="text-info"
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                    />
                    <KpiCard 
                        label="Cobranza Real Hoy" 
                        value={`$${fmt(kpi.today.income)}`} 
                        sub="Ingreso" 
                        subValue="Neto" 
                        color="text-success"
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    />
                    <KpiCard 
                        label="Saldo Disp. en Cajas" 
                        value={`$${fmt(kpi.cash_in_hand)}`} 
                        sub="Fondo" 
                        subValue="Total" 
                        color="text-brand-400"
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                    />
                    <KpiCard 
                        label="Cuentas por Cobrar" 
                        value={`$${fmt(pending_bills.balance)}`} 
                        sub="Facturas" 
                        subValue={pending_bills.count} 
                        color="text-danger"
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    />
                </div>

                {/* ── Análisis Gráfico y Top Ventas ── */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
                    <div className="bg-white dark:bg-surface-dark-3 rounded-2xl border border-border/40 dark:border-white/10 shadow-sm p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full -mr-16 -mt-16" />
                        <div className="flex items-center justify-between mb-6 relative">
                            <span className="text-[11px] font-black uppercase tracking-widest text-content dark:text-white">Tendencia de Facturación Global (30 Días)</span>
                            <div className="flex items-center gap-2">
                                <div className="text-[10px] font-bold text-content-subtle opacity-50 uppercase tracking-widest leading-none">Total Mes: <span className="text-brand-500 ml-1">$ {fmt(kpi.month.revenue)}</span></div>
                            </div>
                        </div>
                        <SalesChart data={sales_by_day} />
                    </div>

                    <div className="bg-white dark:bg-surface-dark-3 rounded-2xl border border-border/40 dark:border-white/10 shadow-sm p-6 relative overflow-hidden">
                        <div className="flex items-center gap-3 mb-6 relative">
                            <div className="w-8 h-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-widest text-content dark:text-white">Lo más vendido</span>
                        </div>
                        {top_products.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 opacity-20 italic text-[10px] uppercase font-bold text-content-subtle">Sin movimientos reportados</div>
                        ) : (
                            <div className="space-y-4">
                                {top_products.map((p, i) => {
                                    const pct = Math.round((p.total_qty / (top_products[0]?.total_qty || 1)) * 100);
                                    return (
                                        <div key={p.product_id} className="group cursor-default">
                                            <div className="flex justify-between items-center text-[10px] mb-1.5">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-4 h-4 rounded-md bg-surface-2 dark:bg-white/5 flex items-center justify-center text-[8px] font-black text-warning">#{i + 1}</span>
                                                    <span className="font-black text-content dark:text-white uppercase truncate opacity-70 group-hover:opacity-100 transition-all">{p.name}</span>
                                                </div>
                                                <span className="font-black text-content-subtle tabular-nums">{fmt(p.total_qty, 0)} <span className="text-[8px] opacity-40">UDS</span></span>
                                            </div>
                                            <div className="h-1.5 bg-surface-2 dark:bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-warning rounded-full shadow-[0_0_8px_rgba(250,189,47,0.3)] transition-all duration-1000" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Gestión de Alertas Críticas ── */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {/* Alertas de Inventario */}
                    <div className="bg-white dark:bg-surface-dark-3 rounded-2xl border border-danger/20 p-6 relative overflow-hidden">
                         <div className="flex items-center gap-3 mb-6 relative">
                            <div className="w-8 h-8 rounded-lg bg-danger/10 text-danger flex items-center justify-center">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-widest text-danger">Stock Bajo — Requiere Reposición</span>
                        </div>
                        {low_stock.length === 0 ? (
                            <div className="py-10 text-center text-success/40 text-[10px] uppercase font-black tracking-widest">✓ Inventario en Rangos Óptimos</div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {low_stock.map(p => (
                                    <div key={p.id} className="flex items-center justify-between bg-surface-2 dark:bg-[#1c1c1c] border border-border/10 rounded-xl px-4 py-3 hover:border-danger/40 transition-all group">
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-black text-content dark:text-white uppercase truncate mb-0.5">{p.name}</div>
                                            <div className="text-[8px] font-black text-content-subtle uppercase opacity-40">Min: {fmt(p.min_stock, 0)} {p.unit}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-danger font-black text-sm tabular-nums leading-none mb-0.5">{fmt(p.total_stock, 0)}</div>
                                            <div className="text-[8px] font-black text-content-subtle uppercase opacity-40">{p.unit}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Resumen de Compras / Costos */}
                    <div className="bg-white dark:bg-surface-dark-3 rounded-2xl border border-border/40 dark:border-white/10 p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-warning/5 rounded-full -mr-16 -mt-16" />
                        <div className="flex items-center gap-3 mb-6 relative">
                            <div className="w-8 h-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-widest text-content dark:text-white">Inversión en Mercancía (Compras 30D)</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-black text-warning tracking-tighter tabular-nums mb-1">$ {fmt(purchases_month.total)}</div>
                                <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest opacity-60">Basado en {purchases_month.count} adquisiciones</div>
                            </div>
                            <div className="p-4 bg-surface-2 dark:bg-white/5 rounded-2xl border border-border/10">
                                <svg className="w-10 h-10 text-content-subtle opacity-20" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Page>
    );
}
