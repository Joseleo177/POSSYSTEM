import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { buildInventoryExcel } from "../../helpers/excel";
import { fmtNumber, fmtInt } from "../../helpers";
import {
  fmt$, fmtN,
  useReport,
  KpiCard, SectionHeader, Card, Loading, ExportButton, StockBadge,
} from "./reportes.utils";

export default function InventoryReport() {
  const [days, setDays] = useState(30);
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState([]);

  useEffect(() => {
    api.warehouses.getAll().then(r => setWarehouses(r.data)).catch(console.error);
  }, []);

  const { data, loading, error } = useReport(api.reports.inventory, { days, warehouse_id: warehouseId }, [days, warehouseId]);
  const [view, setView] = useState("critical");
  const s = data?.summary;

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-surface-3 dark:bg-white/5 rounded-xl border border-border dark:border-white/5">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${days === d ? "bg-brand-500 text-black shadow-sm" : "text-content-muted dark:text-content-dark-muted opacity-60 hover:opacity-100"}`}>
                {d}D
              </button>
            ))}
          </div>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="bg-surface-3 dark:bg-white/5 border border-border dark:border-white/5 text-[9px] font-black uppercase rounded-lg p-1.5 outline-none text-content dark:text-white w-32"
          >
            <option value="">TODOS</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        {data && <ExportButton onClick={() => buildInventoryExcel(data)} />}
      </div>

      {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
      {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-widest">{error}</div>}

      {!loading && !error && data && (
        <div className="flex-1 min-h-0 space-y-3 overflow-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Nivel Crítico" value={fmtN(s.critical_count)} icon="" color="text-danger" />
            <KpiCard label="Quiebre de Stock" value={fmtN(s.zero_count)} icon="" color="text-danger" />
            <KpiCard label="Baja Rotación" value={fmtN(s.low_rotation_count)} icon="" color="text-brand-500" />
            <KpiCard label="Capital Inmovilizado" value={fmt$(s.total_locked_value)} icon="" color="text-orange-500" />
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide shrink-0">
            {[["critical", "Crítico"], ["zero", "Agotado"], ["top", "Alta Rotación"], ["slow", "Sin Mov."], ["category", "Categorías"]].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border
                  ${view === k ? "bg-brand-500 text-black border-brand-500" : "bg-surface-3 dark:bg-white/5 border-transparent text-content-muted dark:text-content-dark-muted opacity-60 hover:opacity-100"}`}>
                {l}
              </button>
            ))}
          </div>

          <Card className="!p-0 overflow-hidden min-h-0 flex flex-col">
            <div className="p-3 pb-2 border-b border-border dark:border-white/5">
              <SectionHeader
                title={view === "critical" ? "Reposición Urgente" : view === "zero" ? "Inventario Agotado" : view === "top" ? "Alta Rotación" : view === "slow" ? "Inmovilizado" : "Valorización por Rubro"}
                sub="Análisis operacional de existencia"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="bg-surface-2 dark:bg-surface-dark-2/50">
                  {view === "critical" && (
                    <tr className="border-b border-border/40 dark:border-white/5">
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted">Producto</th>
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted text-right">Stock</th>
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted text-right">Mínimo</th>
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted text-right">Faltante</th>
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted text-center">Estado</th>
                    </tr>
                  )}
                  {view === "category" && (
                    <tr className="border-b border-border/40 dark:border-white/5">
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted">Categoría</th>
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted text-right">Surtido</th>
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted text-right">Unidades</th>
                      <th className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-content-muted dark:text-content-dark-muted text-right">Costo Total</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-border/20 dark:divide-white/5">
                  {view === "critical" && data.critical_stock.map((p, i) => (
                    <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                      <td className="px-4 py-2">
                        <div className="font-black text-[9px] uppercase tracking-wider text-content dark:text-white">{p.name}</div>
                        <div className="text-[8px] font-bold text-content-subtle opacity-50 uppercase">{p.category_name}</div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-black text-danger text-[9px]">{fmtNumber(p.stock, 2)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[9px] text-content-subtle">{fmtNumber(p.min_stock, 2)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-brand-500 font-black text-[9px]">+{fmtNumber(p.needed, 2)}</td>
                      <td className="px-4 py-2 text-center"><StockBadge qty={p.stock} min={p.min_stock} /></td>
                    </tr>
                  ))}
                  {view === "category" && data.by_category.map((c, i) => (
                    <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                      <td className="px-4 py-2 font-black text-[10px] uppercase tracking-wider text-brand-500">{c.category_name}</td>
                      <td className="px-4 py-2 text-right font-bold text-[9px] text-content-subtle">{c.product_count} SKU</td>
                      <td className="px-4 py-2 text-right tabular-nums font-black text-[9px] text-content dark:text-white">{fmtInt(c.total_units)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-danger font-black text-[10px]">{fmt$(c.value_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(view === "top" || view === "slow" || view === "zero") && <div className="p-10 text-center text-[9px] font-black uppercase text-content-subtle opacity-30 tracking-[3px]">Análisis Detallado en el Excel Estratégico</div>}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
