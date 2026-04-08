import { useState } from "react";
import { api } from "../../services/api";
import { buildSalesExcel } from "../../helpers/excel";
import {
  fmt$, fmtN, pct, METHOD_COLORS,
  useReport, defaultRange,
  DateRangePicker, KpiCard, SectionHeader, Card, Loading,
  ExportButton, ProgressBar, BarChart, HeatmapHours,
} from "./reportes.utils";

export default function SalesReport() {
  const [range, setRange] = useState(defaultRange(30));
  const { data, loading, error } = useReport(api.reports.sales, { date_from: range.from, date_to: range.to }, [range]);
  const s = data?.summary;

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
        {data && <ExportButton onClick={() => buildSalesExcel(data, range)} />}
      </div>

      {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
      {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-widest">{error}</div>}

      {!loading && !error && data && (
        <div className="flex-1 min-h-0 space-y-3 overflow-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Volumen de Ventas" value={fmtN(s.total_sales)} icon="" color="text-brand-500" />
            <KpiCard label="Ingresos Brutos" value={fmt$(s.total_revenue)} icon="" color="text-green-500" />
            <KpiCard label="Ticket Promedio" value={fmt$(s.avg_ticket)} sub={`Máx: ${fmt$(s.max_sale)}`} icon="" color="text-blue-500" />
            <KpiCard label="Cuentas x Cobrar" value={fmt$(s.pending_amount)} sub={`${s.pending_count} facturas`} icon="" color="text-danger" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="lg:col-span-2">
              <SectionHeader title="Ingresos Cronológicos" sub="Flujo de caja diario" />
              {data.by_day.length > 0 ? (
                <div className="pt-2">
                  <BarChart data={data.by_day} xKey="day" yKey="revenue" color="#FFB800" height={140} />
                </div>
              ) : (
                <div className="h-[140px] flex items-center justify-center text-[9px] font-black uppercase tracking-[2px] text-content-subtle opacity-40">Sin Data</div>
              )}
            </Card>

            <Card>
              <SectionHeader title="Canales de Pago" sub="Distribución" />
              <div className="space-y-3 pt-1">
                {data.by_method.length === 0 ? (
                  <div className="py-10 text-center text-[9px] font-black uppercase text-content-subtle opacity-30 tracking-widest">Sin Registros</div>
                ) : (
                  data.by_method.map(m => (
                    <div key={m.method_name} className="group">
                      <div className="flex justify-between items-end mb-1">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black uppercase tracking-wider text-content dark:text-white">{m.method_name}</span>
                          <span className="text-[8px] font-bold text-content-subtle opacity-50">{m.count} trans.</span>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-black text-content dark:text-white tabular-nums">{fmt$(m.total)}</div>
                          <div className="text-[8px] font-black text-brand-500">{pct(m.total, s.total_revenue)}%</div>
                        </div>
                      </div>
                      <ProgressBar value={m.total} max={s.total_revenue} color={METHOD_COLORS[m.method_type] || "bg-brand-500"} />
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <SectionHeader title="Sectores de Calor" sub="Actividad por hora" />
              <div className="pt-2">
                <HeatmapHours data={data.by_hour} />
              </div>
              {data.by_hour.length > 0 && (() => {
                const peak = data.by_hour.reduce((a, b) => parseFloat(b.revenue) > parseFloat(a.revenue) ? b : a, data.by_hour[0]);
                return (
                  <div className="mt-3 p-2 bg-brand-500/5 rounded-xl border border-dashed border-brand-500/20 flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase tracking-[2px] text-content-subtle opacity-60">Pico de Actividad</span>
                    <span className="text-[9px] font-black text-brand-500">{peak.hour}:00 – {parseInt(peak.hour) + 1}:00 <span className="mx-1 opacity-20">/</span> {fmt$(peak.revenue)}</span>
                  </div>
                );
              })()}
            </Card>

            <Card>
              <SectionHeader title="Fuerza de Ventas" sub="Rendimiento Individual" />
              <div className="space-y-4 pt-2">
                {data.by_employee.map((e, i) => {
                  const maxRev = data.by_employee[0]?.revenue || 1;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-surface-3 dark:bg-white/5 flex items-center justify-center text-[9px] font-black text-brand-500 border border-border dark:border-white/5">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-end mb-1">
                          <div className="flex flex-col truncate">
                            <span className="text-[9px] font-black uppercase tracking-wider truncate text-content dark:text-white">{e.employee_name || "Desconocido"}</span>
                            <span className="text-[8px] font-bold text-content-subtle opacity-50">{e.count} ventas · {fmt$(e.avg_ticket)} prom.</span>
                          </div>
                          <span className="text-[10px] font-black text-green-500 tabular-nums">{fmt$(e.revenue)}</span>
                        </div>
                        <ProgressBar value={e.revenue} max={maxRev} color="bg-green-500" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
