import { useState } from "react";
import { api } from "../../services/api";
import { buildPurchasesExcel } from "../../helpers/excel";
import {
  fmt$, fmtN,
  useReport, defaultRange,
  DateRangePicker, KpiCard, SectionHeader, Card, Loading, ExportButton,
} from "./reportes.utils";

export default function PurchasesReport() {
  const [range, setRange] = useState(defaultRange(30));
  const { data, loading, error } = useReport(api.reports.purchases, { date_from: range.from, date_to: range.to }, [range]);
  const s = data?.summary;

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
        {data && <ExportButton onClick={() => buildPurchasesExcel(data, range)} />}
      </div>

      {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
      {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-widest">{error}</div>}

      {!loading && !error && data && (
        <div className="flex-1 min-h-0 space-y-3 overflow-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Órdenes Compra" value={fmtN(s.total_orders || 0)} icon="" color="text-brand-500" />
            <KpiCard label="Inversión" value={fmt$(s.total_cost || 0)} icon="" color="text-danger" />
            <KpiCard label="Ticket Promedio" value={fmt$(s.avg_order || 0)} icon="" color="text-blue-500" />
            <KpiCard label="Compra Máxima" value={fmt$(s.max_order || 0)} icon="" color="text-green-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="!p-0 overflow-hidden">
              <div className="p-3 border-b border-border dark:border-white/5">
                <SectionHeader title="Principales Aliados" sub="Gasto acumulado" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2/50">
                    <tr className="border-b border-border/40 dark:border-white/5">
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted">Proveedor</th>
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted text-right">Inversión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20 dark:divide-white/5">
                    {data.by_supplier.slice(0, 10).map((sup, i) => (
                      <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                        <td className="px-4 py-2 font-black text-[9px] uppercase tracking-wider text-content dark:text-white">{sup.supplier_name}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-danger font-black text-[9px]">{fmt$(sup.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="!p-0 overflow-hidden">
              <div className="p-3 border-b border-border dark:border-white/5">
                <SectionHeader title="Abastecimiento" sub="Mayor volumen de compra" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-2 dark:bg-surface-dark-2/50">
                    <tr className="border-b border-border/40 dark:border-white/5">
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted">Producto</th>
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted text-right">Costo Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20 dark:divide-white/5">
                    {data.top_products.slice(0, 10).map((p, i) => (
                      <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                        <td className="px-4 py-2 font-black text-[9px] uppercase tracking-wider text-content dark:text-white">{p.product_name}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-blue-500 font-black text-[9px]">{fmt$(p.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
