import { useState } from "react";
import { api } from "../../services/api";
import { buildAuditExcel } from "../../helpers/excel";
import { fmtDate } from "../../helpers";
import {
  fmt$, fmtN,
  useReport, defaultRange,
  DateRangePicker, KpiCard, SectionHeader, Card, Loading, ExportButton,
} from "./reportes.utils";

export default function AuditReport() {
  const [range, setRange] = useState(defaultRange(30));
  const { data, loading, error } = useReport(api.reports.audit, { date_from: range.from, date_to: range.to }, [range]);
  const [view, setView] = useState("employees");
  const rs = data?.returns_summary;

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
        {data && <ExportButton onClick={() => buildAuditExcel(data, range)} />}
      </div>

      {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
      {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-widest">{error}</div>}

      {!loading && !error && data && (
        <div className="flex-1 min-h-0 space-y-3 overflow-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Devoluciones" value={fmtN(rs?.return_count || 0)} icon="" color="text-danger" />
            <KpiCard label="Monto Reembolsado" value={fmt$(rs?.total_returned || 0)} icon="" color="text-danger" />
            <KpiCard label="Ventas c/ Descto." value={fmtN(data.discounts.length)} icon="" color="text-brand-500" />
            <KpiCard label="Auditores Activos" value={fmtN(data.by_employee.length)} icon="" color="text-blue-500" />
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide shrink-0">
            {[["employees", "Vendedores"], ["returns", "Devoluciones"], ["discounts", "Descuentos"]].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border
                  ${view === k ? "bg-brand-500 text-black border-brand-500" : "bg-surface-3 dark:bg-white/5 border-transparent text-content-muted dark:text-content-dark-muted opacity-60 hover:opacity-100"}`}>
                {l}
              </button>
            ))}
          </div>

          <Card className="!p-0 overflow-hidden min-h-0 flex flex-col">
            <div className="p-3 border-b border-border dark:border-white/5">
              <SectionHeader
                title={view === "employees" ? "Rendimiento" : view === "returns" ? "Control Merma" : "Supervisión"}
                sub="Trazabilidad operacional completa" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="bg-surface-2 dark:bg-surface-dark-2/50">
                  {view === "employees" && (
                    <tr className="border-b border-border/40 dark:border-white/5">
                      {["Vendedor", "Ventas", "Ingresos", "Promedio", "Descto."].map((h, i) => (
                        <th key={h} className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted ${i >= 1 ? "text-right" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  )}
                  {view === "returns" && (
                    <tr className="border-b border-border/40 dark:border-white/5">
                      {["ID / Cliente", "Motivo", "Total", "Fecha"].map((h, i) => (
                        <th key={h} className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted ${i === 2 ? "text-right" : i === 3 ? "text-center" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-border/20 dark:divide-white/5">
                  {view === "employees" && data.by_employee.map((e, i) => (
                    <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                      <td className="px-4 py-2 font-black text-[9px] uppercase tracking-wider text-content dark:text-white">{e.employee_name}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-black text-[9px] text-content-muted">{e.sale_count}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-green-500 font-black text-[9px]">{fmt$(e.revenue)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[9px] text-content-subtle">{fmt$(e.avg_ticket)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-danger font-bold text-[9px]">{parseFloat(e.total_discounts) > 0 ? fmt$(e.total_discounts) : "—"}</td>
                    </tr>
                  ))}
                  {view === "returns" && data.returns_list.map((r, i) => (
                    <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                      <td className="px-4 py-2">
                        <div className="font-black text-[9px] uppercase tracking-wider text-content dark:text-white">{r.customer_name || "Venta Casual"}</div>
                        <div className="text-[8px] font-bold text-content-subtle opacity-50 uppercase">#{r.id}</div>
                      </td>
                      <td className="px-4 py-2 text-[9px] font-black text-content-subtle uppercase">{r.reason || "Sin motivo"}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-danger font-black text-[9px]">{fmt$(r.total)}</td>
                      <td className="px-4 py-2 text-center text-[8px] font-black text-content-subtle uppercase">{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
