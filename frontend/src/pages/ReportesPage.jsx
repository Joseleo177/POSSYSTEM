import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../services/api";
import { fmtNumber, fmtInt, todayISO, fmtDate } from "../helpers";
import {
  buildSalesExcel, buildInventoryExcel, buildMarginsExcel,
  buildCustomersExcel, buildAuditExcel, buildReceivablesExcel, buildPurchasesExcel,
} from "../helpers/excel";

// ── Helpers ──────────────────────────────────────────────────
const fmt$  = (n) => `$${fmtNumber(n, 2)}`;
const fmtN  = (n) => fmtInt(n);
const pct   = (part, total) => total > 0 ? ((part / total) * 100).toFixed(1) : "0.0";
const delta = (curr, prev) => prev > 0 ? (((curr - prev) / prev) * 100).toFixed(1) : null;

const METHOD_COLORS = { efectivo:"bg-success", transferencia:"bg-info", banco:"bg-info", movil:"bg-violet-500", pago_movil:"bg-violet-500", zelle:"bg-warning", punto_venta:"bg-brand-500", otro:"bg-surface-3" };

// ── Componentes reutilizables ─────────────────────────────────

function DateRangePicker({ from, to, onChange }) {
  const presets = [
    { label:"Hoy",     days:0  },
    { label:"7 d",  days:7  },
    { label:"30 d", days:30 },
    { label:"90 d", days:90 },
  ];
  const applyPreset = (days) => {
    const t = todayISO();
    if (days === 0) { onChange(t, t); return; }
    const d = new Date(); d.setDate(d.getDate() - days);
    onChange(d.toISOString().slice(0, 10), t);
  };
  return (
    <div className="flex flex-wrap items-center gap-4 mb-4 p-4 bg-white dark:bg-white/5 rounded-xl border border-border/40 dark:border-white/5 shadow-sm">
      <div className="flex gap-2 flex-wrap">
        {presets.map(p => (
          <button key={p.label} onClick={() => applyPreset(p.days)}
            className="px-4 py-2 text-[10px] font-black uppercase tracking-[2px] rounded-xl border border-border/40 dark:border-white/10 bg-surface-1 dark:bg-white/5 text-content-subtle hover:border-brand-500 hover:text-brand-500 transition-all">
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <input type="date" value={from} onChange={e => onChange(e.target.value, to)} className="input !h-10 !text-[11px] !font-black !rounded-xl !bg-surface-2 dark:!bg-white/5 !border-none" />
        <span className="text-content-subtle opacity-40">→</span>
        <input type="date" value={to} onChange={e => onChange(from, e.target.value)} className="input !h-10 !text-[11px] !font-black !rounded-xl !bg-surface-2 dark:!bg-white/5 !border-none" />
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, icon, color="text-brand-500", bg="bg-brand-500/5", delta: d }) {
  return (
    <div className={`rounded-xl border border-border/40 dark:border-white/5 bg-white dark:bg-white/5 p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group`}>
      <div className="absolute top-0 right-0 w-24 h-24 bg-current opacity-[0.03] rounded-bl-[60px] translate-x-12 -translate-y-12 transition-transform group-hover:translate-x-10 group-hover:-translate-y-10" style={{ color: color.includes("text-") ? `var(--${color.split("-")[1]})` : "currentColor" }} />
      <div className="flex justify-between items-start">
        <div className="text-[9px] font-black text-content-subtle uppercase tracking-[3px] leading-none opacity-60">{label}</div>
        <span className="text-xl opacity-80">{icon}</span>
      </div>
      <div className={`text-3xl font-black ${color} tracking-tighter leading-none tabular-nums font-display`}>{value}</div>
      <div className="flex items-center justify-between gap-2 mt-1">
        {sub && <div className="text-[10px] font-bold text-content-subtle opacity-50 truncate">{sub}</div>}
        {d !== null && d !== undefined && (
          <div className={`text-[10px] font-black px-2 py-0.5 rounded-full ${parseFloat(d) >= 0 ? "text-green-500 bg-green-500/10" : "text-danger bg-danger/10"}`}>
            {parseFloat(d) >= 0 ? "▲" : "▼"} {Math.abs(d)}%
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div className="flex flex-col gap-1 mb-6">
      <div className="text-[10px] font-black text-brand-500 uppercase tracking-[4px] leading-none">
        {title}
      </div>
      {sub && <div className="text-[10px] font-bold text-content-subtle opacity-60 tracking-tight">{sub}</div>}
    </div>
  );
}

function Card({ children, className="" }) {
  return (
    <div className={`bg-white dark:bg-white/5 rounded-2xl border border-border/40 dark:border-white/5 p-4 shadow-sm transition-all hover:shadow-md ${className}`}>
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 animate-in fade-in duration-700">
      <div className="w-12 h-12 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin" />
      <div className="text-[10px] font-black text-content-subtle uppercase tracking-[4px]">Generando Inteligencia...</div>
    </div>
  );
}

function BarChart({ data, xKey, yKey, color="#fabd2f", height=160 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!data?.length || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.offsetWidth; const H = height;
    canvas.width = W; canvas.height = H;
    const maxY = Math.max(...data.map(d => parseFloat(d[yKey]) || 0), 1);
    const pad = { top:10, right:10, bottom:28, left:55 };
    const cW = W - pad.left - pad.right;
    const cH = H - pad.top - pad.bottom;
    const barW = Math.max(3, cW / data.length - 3);
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i;
      ctx.strokeStyle = "rgba(150,150,150,0.1)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = "rgba(150,150,150,0.6)"; ctx.font = "9px Inter,sans-serif"; ctx.textAlign = "right";
      const v = maxY * (1 - i / 4);
      ctx.fillText(v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0), pad.left - 4, y + 3);
    }
    data.forEach((d, i) => {
      const x = pad.left + i * (cW / data.length) + (cW / data.length - barW) / 2;
      const barH = ((parseFloat(d[yKey]) || 0) / maxY) * cH;
      const y = pad.top + cH - barH;
      const grad = ctx.createLinearGradient(0, y, 0, pad.top + cH);
      grad.addColorStop(0, color + "cc"); grad.addColorStop(1, color + "22");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(x, y, barW, barH, [3,3,0,0]); ctx.fill();
      const step = Math.ceil(data.length / 10);
      if (i % step === 0) {
        ctx.fillStyle = "rgba(150,150,150,0.7)"; ctx.font = "8px Inter,sans-serif"; ctx.textAlign = "center";
        ctx.fillText(String(d[xKey]).slice(5), x + barW / 2, H - 8);
      }
    });
  }, [data, yKey, xKey, color, height]);
  return <canvas ref={ref} className="w-full" style={{ height }} />;
}

function HeatmapHours({ data }) {
  if (!data?.length) return null;
  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div>
      <div className="flex gap-1 items-end h-14 mb-1">
        {Array.from({ length: 24 }, (_, h) => {
          const row = data.find(d => parseInt(d.hour) === h);
          const rev = parseFloat(row?.revenue || 0);
          const intensity = rev / maxRev;
          return (
            <div key={h} className="flex-1 flex flex-col items-center" title={`${h}:00 — ${fmt$(rev)}`}>
              <div className="w-full rounded-sm" style={{ height:`${Math.max(4, intensity * 52)}px`, background:`rgba(250,189,47,${0.12 + intensity * 0.88})` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 items-end">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex-1 text-center">
            {h % 6 === 0 && <span className="text-[8px] text-content-subtle dark:text-content-dark-muted">{h}h</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color="bg-warning" }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-surface-2 dark:bg-surface-dark-3 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width:`${w}%` }} />
    </div>
  );
}

function ExportButton({ onClick }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-[2px] rounded-xl border border-green-500/30 text-green-500 bg-green-500/5 hover:bg-green-500 hover:text-white transition-all shadow-sm">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
      </svg>
      Exportar Inteligencia
    </button>
  );
}

function StockBadge({ qty, min }) {
  if (parseFloat(qty) <= 0) return <span className="text-[10px] font-black text-danger bg-danger/10 px-1.5 py-0.5 rounded border border-danger/20">SIN STOCK</span>;
  if (min > 0 && parseFloat(qty) < parseFloat(min)) return <span className="text-[10px] font-black text-warning bg-warning/10 px-1.5 py-0.5 rounded border border-warning/20">CRÍTICO</span>;
  return <span className="text-[10px] font-black text-success bg-success/10 px-1.5 py-0.5 rounded border border-success/20">OK</span>;
}

// ── Inicio: helper de período por defecto (30 días) ───────────
function useReport(fetchFn, params, deps = []) {
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

function defaultRange(days = 30) {
  const t = todayISO();
  const d = new Date(); d.setDate(d.getDate() - days);
  return { from: d.toISOString().slice(0, 10), to: t };
}

// ═══════════════════════════════════════════════════════════════
// 1. VENTAS
// ═══════════════════════════════════════════════════════════════
function SalesReport() {
  const [range, setRange] = useState(defaultRange(30));
  const { data, loading, error } = useReport(api.reports.sales, { date_from: range.from, date_to: range.to }, [range]);
  const s = data?.summary;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
        {data && <ExportButton onClick={() => buildSalesExcel(data, range)} />}
      </div>

      {loading && <Loading />}
      {!loading && error && <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-widest">{error}</div>}
      
      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Volumen de Ventas"  value={fmtN(s.total_sales)}     icon="" color="text-brand-500" />
            <KpiCard label="Ingresos Brutos"   value={fmt$(s.total_revenue)}   icon="" color="text-green-500" />
            <KpiCard label="Ticket Promedio"    value={fmt$(s.avg_ticket)}      sub={`Máximo: ${fmt$(s.max_sale)}`} icon="" color="text-blue-500" />
            <KpiCard label="Cuentas x Cobrar"   value={fmt$(s.pending_amount)}  sub={`${s.pending_count} facturas abiertas`} icon="" color="text-danger" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <SectionHeader title="Ingresos Cronológicos" sub="Análisis de flujo de caja diario" />
              {data.by_day.length > 0 ? (
                <div className="pt-4">
                  <BarChart data={data.by_day} xKey="day" yKey="revenue" color="#FFB800" height={220} />
                </div>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-[10px] font-black uppercase tracking-[3px] opacity-20">Sin Data Cronológica</div>
              )}
            </Card>

            <Card>
              <SectionHeader title="Canales de Pago" sub="Distribución por método" />
              <div className="space-y-6 pt-2">
                {data.by_method.length === 0 ? (
                  <div className="py-20 text-center text-[10px] font-black uppercase opacity-20 tracking-widest">Sin Registros</div>
                ) : (
                  data.by_method.map(m => (
                    <div key={m.method_name} className="group cursor-default">
                      <div className="flex justify-between items-end mb-2">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black uppercase tracking-wider text-content dark:text-heading-dark">{m.method_name}</span>
                          <span className="text-[9px] font-bold text-content-subtle opacity-60">{m.count} transacciones</span>
                        </div>
                        <div className="text-right">
                          <div className="text-[12px] font-black text-content dark:text-heading-dark tabular-nums">{fmt$(m.total)}</div>
                          <div className="text-[9px] font-black text-brand-500">{pct(m.total, s.total_revenue)}%</div>
                        </div>
                      </div>
                      <ProgressBar value={m.total} max={s.total_revenue} color={METHOD_COLORS[m.method_type] || "bg-brand-500"} />
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <SectionHeader title="Zonas de Calor Temporal" sub="Actividad por hora del día" />
              <div className="pt-6">
                <HeatmapHours data={data.by_hour} />
              </div>
              {data.by_hour.length > 0 && (() => {
                const peak = data.by_hour.reduce((a, b) => parseFloat(b.revenue) > parseFloat(a.revenue) ? b : a, data.by_hour[0]);
                return (
                  <div className="mt-8 p-4 bg-brand-500/5 rounded-2xl border border-dashed border-brand-500/20 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[2px] text-content-subtle opacity-70">Pico de Actividad</span>
                    <span className="text-[11px] font-black text-brand-500">{peak.hour}:00 – {parseInt(peak.hour)+1}:00 <span className="mx-2 opacity-20">/</span> {fmt$(peak.revenue)}</span>
                  </div>
                );
              })()}
            </Card>

            <Card>
              <SectionHeader title="Fuerza de Ventas" sub="Rendimiento individual por ingresos" />
              <div className="space-y-6 pt-2">
                {data.by_employee.map((e, i) => {
                  const maxRev = data.by_employee[0]?.revenue || 1;
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-surface-2 dark:bg-white/5 flex items-center justify-center text-[11px] font-black text-brand-500 border border-border/40 dark:border-white/5 shadow-sm">{i+1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-end mb-2">
                          <div className="flex flex-col truncate">
                            <span className="text-[11px] font-black uppercase tracking-wider truncate">{e.employee_name || "Desconocido"}</span>
                            <span className="text-[9px] font-bold text-content-subtle opacity-60">{e.count} ventas · {fmt$(e.avg_ticket)} prom.</span>
                          </div>
                          <span className="text-sm font-black text-green-500 tabular-nums">{fmt$(e.revenue)}</span>
                        </div>
                        <ProgressBar value={e.revenue} max={maxRev} color="bg-green-500" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 2. INVENTARIO Y ABASTECIMIENTO
// ═══════════════════════════════════════════════════════════════
function InventoryReport() {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useReport(api.reports.inventory, { days }, [days]);
  const [view, setView] = useState("critical");
  const s = data?.summary;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1.5 bg-surface-2 dark:bg-white/5 rounded-2xl border border-border/40 dark:border-white/5 w-fit">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${days === d ? "bg-white dark:bg-surface-dark-3 text-brand-500 shadow-sm" : "text-content-subtle opacity-60 hover:opacity-100"}`}>
              {d} Días
            </button>
          ))}
        </div>
        {data && <ExportButton onClick={() => buildInventoryExcel(data)} />}
      </div>

      {loading && <Loading />}
      {!loading && error && <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-widest">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Nivel Crítico"     value={fmtN(s.critical_count)}   icon="" color="text-danger" />
            <KpiCard label="Quiebre de Stock"  value={fmtN(s.zero_count)}       icon="" color="text-danger" />
            <KpiCard label="Baja Rotación"     value={fmtN(s.low_rotation_count)} icon="" color="text-brand-500" />
            <KpiCard label="Capital Inmovilizado" value={fmt$(s.total_locked_value)} icon="" color="text-orange-500" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar">
            {[["critical","Stock Crítico"],["zero","Sin Stock"],["top","Alta Rotación"],["slow","Sin Movimiento"],["category","Por Categoría"]].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[2px] transition-all whitespace-nowrap border-2
                  ${view === k ? "bg-brand-500 text-brand-900 border-brand-500 shadow-lg shadow-brand-500/20" : "bg-white dark:bg-white/5 border-transparent text-content-subtle opacity-60 hover:opacity-100"}`}>
                {l}
              </button>
            ))}
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="p-4 pb-0">
               <SectionHeader title={view === "critical" ? "Reposición Urgente" : view === "zero" ? "Inventario Agotado" : view === "top" ? "Productos Estrella" : view === "slow" ? "Capital Estancado" : "Valorización Industrial"} 
                              sub="Detalle técnico de existencias y proyecciones" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-1 dark:bg-white/5 transition-colors border-y border-border/40 dark:border-white/5">
                  {view === "critical" && (
                    <tr>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Producto</th>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Stock</th>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Mínimo</th>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Faltante</th>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-center">Estado</th>
                    </tr>
                  )}
                  {view === "category" && (
                    <tr>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Categoría</th>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Surtido</th>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Existencias</th>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Costo Total</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-border/20 dark:divide-white/5">
                  {view === "critical" && data.critical_stock.map((p, i) => (
                    <tr key={i} className="hover:bg-surface-1/50 dark:hover:bg-white/5 transition-colors">
                      <td className="p-6">
                        <div className="font-black text-xs uppercase tracking-wider">{p.name}</div>
                        <div className="text-[10px] font-bold text-content-subtle opacity-60">{p.category_name}</div>
                      </td>
                      <td className="p-6 text-right tabular-nums font-black text-danger">{fmtNumber(p.stock, 2)}</td>
                      <td className="p-6 text-right tabular-nums">{fmtNumber(p.min_stock, 2)}</td>
                      <td className="p-6 text-right tabular-nums text-brand-500 font-black">+{fmtNumber(p.needed, 2)}</td>
                      <td className="p-6 text-center"><StockBadge qty={p.stock} min={p.min_stock} /></td>
                    </tr>
                  ))}
                  {view === "category" && data.by_category.map((c, i) => (
                    <tr key={i} className="hover:bg-surface-1/50 dark:hover:bg-white/5 transition-colors">
                      <td className="p-6 font-black text-xs uppercase tracking-wider text-brand-500">{c.category_name}</td>
                      <td className="p-6 text-right font-bold text-xs">{c.product_count} SKUs</td>
                      <td className="p-6 text-right tabular-nums font-black">{fmtInt(c.total_units)}</td>
                      <td className="p-6 text-right tabular-nums text-danger font-black">{fmt$(c.value_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 3. MÁRGENES DE UTILIDAD
// ═══════════════════════════════════════════════════════════════
function MarginsReport() {
  const [range, setRange] = useState(defaultRange(30));
  const { data, loading, error } = useReport(api.reports.margins, { date_from: range.from, date_to: range.to }, [range]);
  const [view, setView] = useState("top");
  const s = data?.summary;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
        {data && <ExportButton onClick={() => buildMarginsExcel(data, range)} />}
      </div>

      {loading && <Loading />}
      {!loading && error && <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-widest">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Retorno de Inversión" value={`${s.avg_margin_pct || 0}%`} icon="" color="text-brand-500" />
            <KpiCard label="Utilidad Bruta"     value={fmt$(s.total_margin || 0)}   icon="" color="text-green-500" />
            <KpiCard label="Ingresos de Operación" value={fmt$(s.total_revenue || 0)} icon="" color="text-blue-500" />
            <KpiCard label="Costo de Mercancía"    value={fmt$(s.total_cost || 0)}     icon="" color="text-danger" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar">
            {[["top","Mayor Margen"],["bottom","Menor Margen"],["category","Por Categoría"]].map(([k,l]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[2px] transition-all whitespace-nowrap border-2
                  ${view === k ? "bg-brand-500 text-brand-900 border-brand-500 shadow-lg shadow-brand-500/20" : "bg-white dark:bg-white/5 border-transparent text-content-subtle opacity-60 hover:opacity-100"}`}>
                {l}
              </button>
            ))}
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="p-4">
              <SectionHeader title={view === "top" ? "Productos de Alta Rentabilidad" : view === "bottom" ? "Optimización de Precios" : "Rentabilidad Sectorizada"} 
                            sub="Cálculo basado en el costo de reposición actual" />
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-1 dark:bg-white/5 border-y border-border/40 dark:border-white/5">
                  {view === "top" && <tr><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Ranking</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Producto</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Ingresos</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Inversión</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Utilidad</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-center">ROI %</th></tr>}
                  {view === "category" && <tr><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Categoría</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Volumen</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Utilidad</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-center">Sostenibilidad</th></tr>}
                </thead>
                <tbody className="divide-y divide-border/20 dark:divide-white/5">
                  {view === "top" && data.by_product.slice(0, 15).map((p, i) => (
                    <tr key={i} className="hover:bg-surface-1/50 dark:hover:bg-white/5 transition-all">
                      <td className="p-6"><div className="w-8 h-8 rounded-xl bg-surface-2 dark:bg-white/5 flex items-center justify-center text-[10px] font-black text-brand-500">{i+1}</div></td>
                      <td className="p-6">
                        <div className="font-black text-xs uppercase tracking-wider">{p.product_name}</div>
                        <div className="text-[10px] font-bold text-content-subtle opacity-50">{p.category_name}</div>
                      </td>
                      <td className="p-6 text-right tabular-nums font-black">{fmt$(p.revenue)}</td>
                      <td className="p-6 text-right tabular-nums text-danger">{fmt$(p.total_cost)}</td>
                      <td className="p-6 text-right tabular-nums text-green-500 font-black">{fmt$(p.gross_margin)}</td>
                      <td className="p-6 text-center">
                        <span className={`text-[10px] font-black px-3 py-1.5 rounded-full ${parseFloat(p.margin_pct) >= 30 ? "text-green-500 bg-green-500/10" : "text-brand-500 bg-brand-500/10"}`}>
                          {p.margin_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {view === "category" && data.by_category.map((c, i) => (
                    <tr key={i} className="hover:bg-surface-1/50 dark:hover:bg-white/5 transition-all">
                      <td className="p-6 font-black text-xs uppercase tracking-wider text-brand-500">{c.category_name}</td>
                      <td className="p-6 text-right tabular-nums font-black">{fmt$(c.revenue)}</td>
                      <td className="p-6 text-right tabular-nums text-green-500 font-black">{fmt$(c.gross_margin)}</td>
                      <td className="p-6 text-center">
                        <span className={`text-[10px] font-black px-3 py-1.5 rounded-full ${parseFloat(c.margin_pct) >= 25 ? "text-green-500 bg-green-500/10" : "text-brand-500 bg-brand-500/10"}`}>
                          {c.margin_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {view === "bottom" && <div className="p-20 text-center text-[10px] font-black uppercase tracking-widest opacity-20">Análisis Diferencial Detallado en el Excel Estratégico</div>}
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 4. CLIENTES Y FIDELIZACIÓN
// ═══════════════════════════════════════════════════════════════
function CustomersReport() {
  const [range, setRange] = useState(defaultRange(30));
  const [inactiveDays, setInactiveDays] = useState(45);
  const { data, loading, error } = useReport(api.reports.customersAnalysis, { date_from: range.from, date_to: range.to, inactive_days: inactiveDays }, [range, inactiveDays]);
  const [view, setView] = useState("top");
  const rr = data?.repeat_rate;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
        {data && <ExportButton onClick={() => buildCustomersExcel(data, range)} />}
      </div>

      {loading && <Loading />}
      {!loading && error && <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-widest">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Nuevos Clientes"  value={fmtN(data.new_customers.length)} icon="" color="text-brand-500" />
            <KpiCard label="Clientes Inactivos" value={fmtN(data.inactive_customers.length)} icon="" color="text-danger" sub={`>${inactiveDays} días`} />
            <KpiCard label="Tasa de Recurrencia" value={rr?.identified_customers > 0 ? `${pct(rr.repeat_customers, rr.identified_customers)}%` : "—"} icon="" color="text-blue-500" />
            <KpiCard label="Crecimiento Neto" value={`+${pct(data.new_customers.length, (rr?.identified_customers || 1))}%`} icon="" color="text-green-500" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar">
            {[["top","Top Clientes"],["inactive","Inactivos"],["new","Nuevos"],["ticket","Distribución Ticket"]].map(([k,l]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[2px] transition-all whitespace-nowrap border-2
                  ${view === k ? "bg-brand-500 text-brand-900 border-brand-500 shadow-lg shadow-brand-500/20" : "bg-white dark:bg-white/5 border-transparent text-content-subtle opacity-60 hover:opacity-100"}`}>
                {l}
              </button>
            ))}
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="p-4 pb-4">
              <SectionHeader title={view === "top" ? "Ranking de Clientes Elite" : view === "inactive" ? "Campaña de Reactivación" : view === "new" ? "Registro de Nuevos Prospectos" : "Segmentación por Ticket"}
                            sub="Perfiles detallados y métricas de consumo" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-1 dark:bg-white/5 border-y border-border/40 dark:border-white/5">
                  {view === "top" && <tr><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Cliente</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Compras</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Promedio</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Inversión Total</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-center">Última Visita</th></tr>}
                  {view === "inactive" && <tr><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Cliente</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Valor Histórico</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-center">Días Inactivo</th></tr>}
                </thead>
                <tbody className="divide-y divide-border/20 dark:divide-white/5">
                  {view === "top" && data.top_customers.map((c, i) => (
                    <tr key={i} className="hover:bg-surface-1/50 dark:hover:bg-white/5 transition-all">
                      <td className="p-6">
                        <div className="font-black text-xs uppercase tracking-wider">{c.name}</div>
                        <div className="text-[10px] font-bold text-content-subtle opacity-50">{c.phone || "Sin contacto"}</div>
                      </td>
                      <td className="p-6 text-right tabular-nums font-black">{c.purchase_count}</td>
                      <td className="p-6 text-right tabular-nums">{fmt$(c.avg_ticket)}</td>
                      <td className="p-6 text-right tabular-nums text-green-500 font-black">{fmt$(c.total_spent)}</td>
                      <td className="p-6 text-center text-[10px] font-bold">{new Date(c.last_purchase).toLocaleDateString("es-VE")}</td>
                    </tr>
                  ))}
                  {view === "inactive" && data.inactive_customers.map((c, i) => (
                    <tr key={i} className="hover:bg-surface-1/50 dark:hover:bg-white/5 transition-all">
                      <td className="p-6">
                        <div className="font-black text-xs uppercase tracking-wider">{c.name}</div>
                        <div className="text-[10px] font-bold text-content-subtle opacity-50">{c.phone || "Sin contacto"}</div>
                      </td>
                      <td className="p-6 text-right tabular-nums font-black text-brand-500">{fmt$(c.lifetime_value)}</td>
                      <td className="p-6 text-center">
                        <span className={`px-3 py-1.5 rounded-full text-[10px] font-black ${c.days_inactive > 60 ? "bg-danger/10 text-danger" : "bg-brand-500/10 text-brand-500"}`}>
                          {c.days_inactive} Días
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(view === "new" || view === "ticket") && <div className="p-20 text-center text-[10px] font-black uppercase tracking-widest opacity-20 border-t border-border/10">Segmentación Completa en Reporte Maestro</div>}
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 5. AUDITORÍA Y PERSONAL
// ═══════════════════════════════════════════════════════════════
function AuditReport() {
  const [range, setRange] = useState(defaultRange(30));
  const { data, loading, error } = useReport(api.reports.audit, { date_from: range.from, date_to: range.to }, [range]);
  const [view, setView] = useState("employees");
  const rs = data?.returns_summary;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
        {data && <ExportButton onClick={() => buildAuditExcel(data, range)} />}
      </div>

      {loading && <Loading />}
      {!loading && error && <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-widest">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Devoluciones" value={fmtN(rs?.return_count || 0)} icon="" color="text-danger" />
            <KpiCard label="Monto Reembolsado" value={fmt$(rs?.total_returned || 0)} icon="" color="text-danger" />
            <KpiCard label="Ventas con Descuento" value={fmtN(data.discounts.length)} icon="" color="text-brand-500" />
            <KpiCard label="Auditores Activos" value={fmtN(data.by_employee.length)} icon="" color="text-blue-500" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar">
            {[["employees","Vendedores"],["returns","Devoluciones"],["discounts","Descuentos"]].map(([k,l]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[2px] transition-all whitespace-nowrap border-2
                  ${view === k ? "bg-brand-500 text-brand-900 border-brand-500 shadow-lg shadow-brand-500/20" : "bg-white dark:bg-white/5 border-transparent text-content-subtle opacity-60 hover:opacity-100"}`}>
                {l}
              </button>
            ))}
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="p-4 pb-4">
              <SectionHeader title={view === "employees" ? "Rendimiento y Cumplimiento" : view === "returns" ? "Control de Merma y Devoluciones" : "Supervisión de Descuentos"}
                            sub="Trazabilidad completa de operaciones y transacciones" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-1 dark:bg-white/5 border-y border-border/40 dark:border-white/5">
                  {view === "employees" && <tr><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Vendedor</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Ventas</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Ingresos</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Promedio</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Descuentos</th></tr>}
                  {view === "returns" && <tr><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">ID</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Cliente</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Motivo</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Total</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-center">Fecha</th></tr>}
                </thead>
                <tbody className="divide-y divide-border/20 dark:divide-white/5">
                  {view === "employees" && data.by_employee.map((e, i) => (
                    <tr key={i} className="hover:bg-surface-1/50 dark:hover:bg-white/5 transition-all">
                      <td className="p-6 font-black text-xs uppercase tracking-wider">{e.employee_name}</td>
                      <td className="p-6 text-right tabular-nums font-black">{e.sale_count}</td>
                      <td className="p-6 text-right tabular-nums text-green-500 font-black">{fmt$(e.revenue)}</td>
                      <td className="p-6 text-right tabular-nums">{fmt$(e.avg_ticket)}</td>
                      <td className="p-6 text-right tabular-nums text-danger font-bold">{parseFloat(e.total_discounts) > 0 ? fmt$(e.total_discounts) : "—"}</td>
                    </tr>
                  ))}
                  {view === "returns" && data.returns_list.map((r, i) => (
                    <tr key={i} className="hover:bg-surface-1/50 dark:hover:bg-white/5 transition-all">
                      <td className="p-6 text-[10px] font-black opacity-50">#{r.id}</td>
                      <td className="p-6 font-black text-xs uppercase tracking-wider">{r.customer_name || "Venta Casual"}</td>
                      <td className="p-6 text-[10px] font-bold text-content-subtle opacity-60">{r.reason || "Sin especificar"}</td>
                      <td className="p-6 text-right tabular-nums text-danger font-black">{fmt$(r.total)}</td>
                      <td className="p-6 text-center text-[10px] font-bold">{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 6. CUENTAS POR COBRAR
// ═══════════════════════════════════════════════════════════════
function ReceivablesReport() {
  const { data, loading, error } = useReport(api.reports.receivables, {}, []);
  const s = data?.summary;
  const a = data?.aging;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-end">
        {data && <ExportButton onClick={() => buildReceivablesExcel(data)} />}
      </div>

      {loading && <Loading />}
      {!loading && error && <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-widest">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Cuentas Pendientes" value={fmtN(s.total_invoices || 0)} icon="" color="text-orange-500" />
            <KpiCard label="Saldo en Calle"     value={fmt$(s.total_balance || 0)} icon="" color="text-danger" />
            <KpiCard label="Cartera Total"      value={fmt$(s.total_billed || 0)}  icon="" color="text-blue-500" />
            <KpiCard label="Recuperación"       value={`${pct((s.total_billed||0) - (s.total_balance||0), s.total_billed || 1)}%`} icon="" color="text-green-500" />
          </div>

          {a && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label:"0 – 30 Días",    amount:a.d0_30_amount,    color:"text-success",  status:"bg-success" },
                { label:"31 – 60 Días",   amount:a.d31_60_amount,   color:"text-brand-500", status:"bg-brand-500" },
                { label:"Crítico +60d",  amount:a.d60_plus_amount, color:"text-danger",    status:"bg-danger" },
              ].map(b => (
                <Card key={b.label} className="!p-4 border-l-4" style={{ borderLeftColor: `var(--${b.color.split('-')[1]}-500)` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${b.status}`}></span>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-50">{b.label}</div>
                  </div>
                  <div className={`text-2xl font-black ${b.color} tabular-nums`}>{fmt$(b.amount || 0)}</div>
                </Card>
              ))}
            </div>
          )}

          <Card className="!p-0 overflow-hidden">
            <div className="p-4 pb-4">
               <SectionHeader title="Detalle de Cartera por Cliente" sub="Estado de cuenta y antigüedad de saldos" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-1 dark:bg-white/5 border-y border-border/40 dark:border-white/5">
                  <tr>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Cliente</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Facturas</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Saldo Deudor</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-center">Aging</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 dark:divide-white/5">
                  {data.by_customer.map((c, i) => {
                    const daysDiff = Math.floor((Date.now() - new Date(c.oldest_invoice)) / 86400000);
                    return (
                      <tr key={i} className="hover:bg-surface-1/50 dark:hover:bg-white/5 transition-all">
                        <td className="p-6">
                          <div className="font-black text-xs uppercase tracking-wider">{c.customer_name}</div>
                          <div className="text-[10px] font-bold text-content-subtle opacity-50">{c.phone || "—"}</div>
                        </td>
                        <td className="p-6 text-right tabular-nums font-black">{c.invoice_count}</td>
                        <td className="p-6 text-right tabular-nums text-danger font-black">{fmt$(c.balance)}</td>
                        <td className="p-6 text-center">
                          <span className={`px-3 py-1.5 rounded-full text-[10px] font-black ${daysDiff > 60 ? "bg-danger/10 text-danger" : daysDiff > 30 ? "bg-brand-500/10 text-brand-500" : "bg-green-500/10 text-green-500"}`}>
                            {daysDiff} Días
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 7. COMPRAS
// ═══════════════════════════════════════════════════════════════
function PurchasesReport() {
  const [range, setRange] = useState(defaultRange(30));
  const { data, loading, error } = useReport(api.reports.purchases, { date_from: range.from, date_to: range.to }, [range]);
  const s = data?.summary;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
        {data && <ExportButton onClick={() => buildPurchasesExcel(data, range)} />}
      </div>

      {loading && <Loading />}
      {!loading && error && <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-widest">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Órdenes de Compra" value={fmtN(s.total_orders || 0)} icon="" color="text-brand-500" />
            <KpiCard label="Inversión Total"   value={fmt$(s.total_cost || 0)}  icon="" color="text-danger" />
            <KpiCard label="Ticket Promedio"   value={fmt$(s.avg_order || 0)} icon="" color="text-blue-500" />
            <KpiCard label="Compra Máxima"     value={fmt$(s.max_order || 0)} icon="" color="text-green-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="!p-0 overflow-hidden">
              <div className="p-4 pb-4"><SectionHeader title="Principales Aliados" sub="Gasto acumulado por proveedor" /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-1 dark:bg-white/5 border-y border-border/40 dark:border-white/5">
                    <tr><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Proveedor</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Monto</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/20 dark:divide-white/5">
                    {data.by_supplier.slice(0, 5).map((sup, i) => (
                      <tr key={i} className="hover:bg-surface-1/50 dark:hover:bg-white/5 transition-all">
                        <td className="p-6 font-black text-xs uppercase tracking-wider">{sup.supplier_name}</td>
                        <td className="p-6 text-right tabular-nums text-danger font-black">{fmt$(sup.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="!p-0 overflow-hidden">
              <div className="p-4 pb-4"><SectionHeader title="Top Artículos" sub="Productos con mayor volumen de compra" /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-1 dark:bg-white/5 border-y border-border/40 dark:border-white/5">
                    <tr><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60">Producto</th><th className="p-6 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Costo Total</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/20 dark:divide-white/5">
                    {data.top_products.slice(0, 5).map((p, i) => (
                      <tr key={i} className="hover:bg-surface-1/50 dark:hover:bg-white/5 transition-all">
                        <td className="p-6 font-black text-xs uppercase tracking-wider">{p.product_name}</td>
                        <td className="p-6 text-right tabular-nums text-blue-500 font-black">{fmt$(p.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
const TABS = [
  { key:"ventas",     label:"Ventas",              icon:"" },
  { key:"inventario", label:"Inventario",           icon:"" },
  { key:"margenes",   label:"Márgenes",             icon:"" },
  { key:"clientes",   label:"Clientes",             icon:"" },
  { key:"auditoria",  label:"Auditoría",            icon:"" },
  { key:"cobrar",     label:"Ctas. por Cobrar",     icon:"" },
  { key:"compras",    label:"Compras",              icon:"" },
];

export default function ReportesPage() {
  const [tab, setTab] = useState("ventas");

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000 max-w-[1600px] mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
        <div>
          <div className="text-[10px] font-black text-brand-500 uppercase tracking-[6px] mb-2 leading-none">Módulo de Analítica</div>
          <h1 className="text-4xl font-black text-content dark:text-heading-dark tracking-tighter font-display leading-none">Reportes Estratégicos</h1>
        </div>
        <p className="text-[11px] font-bold text-content-subtle opacity-60 tracking-tight max-w-[300px] leading-relaxed">
          Visualiza el rendimiento real de tu negocio con data procesada en tiempo real para decisiones de alto nivel.
        </p>
      </div>

      <div className="flex gap-2 mb-4 p-1.5 bg-surface-2 dark:bg-white/5 rounded-[28px] border border-border/40 dark:border-white/5 overflow-x-auto scrollbar-hide no-scrollbar w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-3 px-6 py-3.5 text-[10px] font-black tracking-[3px] uppercase rounded-[20px] transition-all whitespace-nowrap
              ${tab === t.key
                ? "bg-white dark:bg-surface-dark-3 text-brand-500 shadow-md scale-[1.02]"
                : "text-content-subtle opacity-60 hover:opacity-100 hover:bg-white/40 dark:hover:bg-white/5"
              }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
        {tab === "ventas"     && <SalesReport />}
        {tab === "inventario" && <InventoryReport />}
        {tab === "margenes"   && <MarginsReport />}
        {tab === "clientes"   && <CustomersReport />}
        {tab === "auditoria"  && <AuditReport />}
        {tab === "cobrar"     && <ReceivablesReport />}
        {tab === "compras"    && <PurchasesReport />}
      </div>
    </div>
  );
}
