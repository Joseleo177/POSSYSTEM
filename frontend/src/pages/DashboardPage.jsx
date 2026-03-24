import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../services/api";
import { fmtNumber, fmtInt } from "../helpers";

const fmt  = (n, d = 2) => fmtNumber(n, d);
const fmtN = (n)        => fmtInt(n);

function KpiCard({ label, value, sub, icon, color = "text-warning" }) {
  return (
    <div className="bg-surface-2 dark:bg-surface-dark-2 border border-surface-3 dark:border-surface-dark-3 rounded-md p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="text-[11px] text-content-muted dark:text-content-dark-muted tracking-widest font-semibold uppercase">{label}</div>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${color} mb-1`}>{value}</div>
      {sub && <div className="text-[12px] text-content-muted dark:text-content-dark-muted">{sub}</div>}
    </div>
  );
}

function SalesChart({ data }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!data?.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width  = W;
    canvas.height = H;

    const maxRev = Math.max(...data.map(d => d.revenue), 1);
    const pad = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top  - pad.bottom;
    const barW   = Math.max(4, chartW / data.length - 4);

    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(200,200,200,0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = "rgba(200,200,200,0.5)";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(fmt(maxRev * (1 - i / 4), 0), pad.left - 6, y + 4);
    }

    // Bars
    data.forEach((d, i) => {
      const x = pad.left + i * (chartW / data.length) + (chartW / data.length - barW) / 2;
      const barH = (d.revenue / maxRev) * chartH;
      const y = pad.top + chartH - barH;

      const grad = ctx.createLinearGradient(0, y, 0, pad.top + chartH);
      grad.addColorStop(0, "rgba(250, 189, 47, 0.9)");
      grad.addColorStop(1, "rgba(250, 189, 47, 0.15)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 3);
      ctx.fill();

      // X labels (every 5 days)
      if (i % 5 === 0) {
        const d_ = new Date(d.day + "T12:00:00");
        ctx.fillStyle = "rgba(200,200,200,0.6)";
        ctx.font = "10px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${d_.getDate()}/${d_.getMonth() + 1}`, x + barW / 2, H - pad.bottom + 16);
      }
    });
  }, [data]);

  return (
    <div className="bg-surface-2 dark:bg-surface-dark-2 border border-surface-3 dark:border-surface-dark-3 rounded-md p-5">
      <div className="text-[11px] text-content-muted dark:text-content-dark-muted tracking-widest font-semibold uppercase mb-4">
        VENTAS ÚLTIMOS 30 DÍAS
      </div>
      <canvas ref={canvasRef} style={{ width: "100%", height: "180px", display: "block" }} />
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.dashboard.get();
      setData(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-content-muted dark:text-content-dark-muted text-[13px]">
      Cargando dashboard…
    </div>
  );

  if (error) return (
    <div className="text-center py-10 text-danger text-[13px]">{error}</div>
  );

  const { kpi, top_products, sales_by_day, pending_bills, low_stock, new_customers, purchases_month } = data;

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-content dark:text-content-dark">Dashboard</h1>
          <p className="text-[12px] text-content-muted dark:text-content-dark-muted mt-0.5">
            {new Date().toLocaleDateString("es-VE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <button onClick={load} className="btn-sm btn-secondary text-[12px]">↻ Actualizar</button>
      </div>

      {/* KPI Cards — Hoy */}
      <div className="text-[10px] text-content-muted dark:text-content-dark-muted tracking-widest font-semibold uppercase mb-3">HOY</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Ventas hoy"       value={fmtN(kpi.today.sales)}       sub={`$${fmt(kpi.today.revenue)}`} icon="" color="text-warning" />
        <KpiCard label="Ingresos hoy"     value={`$${fmt(kpi.today.revenue)}`} sub="facturado"                       icon="" color="text-success" />
        <KpiCard label="Ctas. por cobrar" value={fmtN(pending_bills.count)}   sub={`$${fmt(pending_bills.balance)} pendiente`} icon="" color="text-danger" />
        <KpiCard label="Alertas stock"    value={fmtN(low_stock.length)}      sub="productos bajo mínimo"           icon="" color="text-danger" />
      </div>

      {/* KPI Cards — Periodo */}
      <div className="text-[10px] text-content-muted dark:text-content-dark-muted tracking-widest font-semibold uppercase mb-3">ÚLTIMOS 30 DÍAS</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Ventas (30d)"     value={fmtN(kpi.month.sales)}       sub={`$${fmt(kpi.month.revenue)}`}       icon="" color="text-info" />
        <KpiCard label="Ingresos (30d)"   value={`$${fmt(kpi.month.revenue)}`} sub="facturado"                              icon="" color="text-success" />
        <KpiCard label="Compras (30d)"    value={fmtN(purchases_month.count)} sub={`$${fmt(purchases_month.total)}`}   icon="" color="text-warning" />
        <KpiCard label="Nuevos clientes"  value={fmtN(new_customers)}         sub="este mes"                               icon="" color="text-info" />
      </div>

      {/* Chart + Top productos */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 mb-6">
        <SalesChart data={sales_by_day} />

        <div className="bg-surface-2 dark:bg-surface-dark-2 border border-surface-3 dark:border-surface-dark-3 rounded-md p-5">
          <div className="text-[11px] text-content-muted dark:text-content-dark-muted tracking-widest font-semibold uppercase mb-4">
            TOP PRODUCTOS (30 DÍAS)
          </div>
          {top_products.length === 0 ? (
            <div className="text-[13px] text-content-muted dark:text-content-dark-muted text-center py-4">Sin datos</div>
          ) : (
            <div className="space-y-3">
              {top_products.map((p, i) => {
                const maxQty = top_products[0]?.total_qty || 1;
                const pct = Math.round((p.total_qty / maxQty) * 100);
                return (
                  <div key={p.product_id}>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span className="font-medium text-content dark:text-content-dark truncate mr-2">
                        <span className="text-warning mr-1.5">#{i + 1}</span>{p.name}
                      </span>
                      <span className="text-content-muted dark:text-content-dark-muted whitespace-nowrap">{fmt(p.total_qty, 0)} uds</span>
                    </div>
                    <div className="h-1.5 bg-surface-3 dark:bg-surface-dark-3 rounded-full overflow-hidden">
                      <div className="h-full bg-warning rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Alertas stock bajo */}
      {low_stock.length > 0 && (
        <div className="bg-surface-2 dark:bg-surface-dark-2 border border-danger/40 rounded-md p-5">
          <div className="text-[11px] text-danger tracking-widest font-semibold uppercase mb-4">
            STOCK BAJO — REQUIERE ATENCIÓN
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {low_stock.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-surface-1 dark:bg-surface-dark-1 border border-danger/20 rounded p-3">
                <div>
                  <div className="text-[13px] font-medium text-content dark:text-content-dark">{p.name}</div>
                  <div className="text-[11px] text-content-muted dark:text-content-dark-muted">Mínimo: {fmt(p.min_stock, 0)} {p.unit}</div>
                </div>
                <div className="text-right">
                  <div className="text-danger font-bold text-[15px]">{fmt(p.stock, 0)}</div>
                  <div className="text-[10px] text-content-muted dark:text-content-dark-muted">{p.unit}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
