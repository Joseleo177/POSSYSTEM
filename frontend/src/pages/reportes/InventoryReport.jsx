import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { buildInventoryExcel } from "../../helpers/excel";
import { fmtNumber, fmtInt } from "../../helpers";
import {
 fmt$, fmtN,
 useReport,
 KpiCard, SectionHeader, Card, Loading, ExportButton, StockBadge,
} from "./reportes.utils";
import CustomSelect from "../../components/ui/CustomSelect";

const TH = ({ children, right, center }) => (
  <th className={`px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted ${right ? "text-right" : center ? "text-center" : ""}`}>
    {children}
  </th>
);

const EMPTY = ({ msg = "Sin registros en este período" }) => (
  <tr><td colSpan={10} className="px-4 py-16 text-center text-[11px] font-black uppercase tracking-wide text-content-subtle opacity-30">{msg}</td></tr>
);

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
   <div className="h-full flex flex-col space-y-4 overflow-auto">
     <div className="flex items-center justify-between gap-3 shrink-0">
       <div className="flex items-center gap-2">
         <div className="flex items-center gap-1 p-1 bg-surface-3 dark:bg-white/5 rounded-xl border border-border dark:border-white/5">
           {[7, 30, 90].map(d => (
             <button key={d} onClick={() => setDays(d)}
               className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all ${days === d ? "bg-brand-500 text-black shadow-sm" : "text-content-muted dark:text-content-dark-muted opacity-60 hover:opacity-100"}`}>
               {d}D
             </button>
           ))}
         </div>
         <CustomSelect
           value={warehouseId}
           onChange={setWarehouseId}
           placeholder="TODOS"
           className="w-36"
           options={[
             { value: "", label: "TODOS" },
             ...warehouses.map(w => ({ value: String(w.id), label: w.name }))
           ]}
         />
       </div>
       {data && <ExportButton onClick={() => buildInventoryExcel(data)} />}
     </div>

     {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
     {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-wide">{error}</div>}

     {!loading && !error && data && (
       <div className="flex-1 min-h-0 space-y-3 overflow-auto">
         <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
           <KpiCard label="Nivel Crítico" value={fmtN(s.critical_count)} color="text-danger" />
           <KpiCard label="Quiebre de Stock" value={fmtN(s.zero_count)} color="text-danger" />
           <KpiCard label="Baja Rotación" value={fmtN(s.low_rotation_count)} color="text-brand-500" />
           <KpiCard label="Capital Inmovilizado" value={fmt$(s.total_locked_value)} color="text-orange-500" />
         </div>

         <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide shrink-0">
           {[
             ["critical", "Crítico"],
             ["zero", "Agotado"],
             ["top", "Alta Rotación"],
             ["slow", "Sin Mov."],
             ["category", "Categorías"],
           ].map(([k, l]) => (
             <button key={k} onClick={() => setView(k)}
               className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all whitespace-nowrap border
               ${view === k ? "bg-brand-500 text-black border-brand-500" : "bg-surface-3 dark:bg-white/5 border-transparent text-content-muted dark:text-content-dark-muted opacity-60 hover:opacity-100"}`}>
               {l}
             </button>
           ))}
         </div>

         <Card className="!p-0 overflow-auto min-h-0 flex flex-col">
           <div className="p-3 pb-2 border-b border-border dark:border-white/5">
             <SectionHeader
               title={
                 view === "critical" ? "Reposición Urgente" :
                 view === "zero"     ? "Inventario Agotado" :
                 view === "top"      ? "Productos de Alta Rotación" :
                 view === "slow"     ? "Capital Inmovilizado / Sin Movimiento" :
                                       "Valorización por Categoría"
               }
               sub="Análisis operacional de existencia"
             />
           </div>
           <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse min-w-[600px]">
               <thead className="bg-surface-2 dark:bg-surface-dark-2/50">

                 {view === "critical" && (
                   <tr className="border-b border-border/40 dark:border-white/5">
                     <TH>Producto</TH>
                     <TH right>Stock</TH>
                     <TH right>Mínimo</TH>
                     <TH right>Faltante</TH>
                     <TH center>Estado</TH>
                   </tr>
                 )}
                 {view === "zero" && (
                   <tr className="border-b border-border/40 dark:border-white/5">
                     <TH>Producto</TH>
                     <TH>Categoría</TH>
                     <TH right>Stock</TH>
                     <TH center>Estado</TH>
                   </tr>
                 )}
                 {view === "top" && (
                   <tr className="border-b border-border/40 dark:border-white/5">
                     <TH>Producto</TH>
                     <TH right>Unidades Vendidas</TH>
                     <TH right>Ingresos</TH>
                     <TH right>Stock Actual</TH>
                   </tr>
                 )}
                 {view === "slow" && (
                   <tr className="border-b border-border/40 dark:border-white/5">
                     <TH>Producto</TH>
                     <TH>Categoría</TH>
                     <TH right>Stock</TH>
                     <TH right>Capital Inmovilizado</TH>
                   </tr>
                 )}
                 {view === "category" && (
                   <tr className="border-b border-border/40 dark:border-white/5">
                     <TH>Categoría</TH>
                     <TH right>Surtido</TH>
                     <TH right>Unidades</TH>
                     <TH right>Costo Total</TH>
                   </tr>
                 )}
               </thead>

               <tbody className="divide-y divide-border/20 dark:divide-white/5">

                 {view === "critical" && (data.critical_stock.length === 0
                   ? <EMPTY msg="Sin productos bajo nivel crítico" />
                   : data.critical_stock.map((p, i) => (
                     <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                       <td className="px-4 py-2">
                         <div className="font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{p.name}</div>
                         <div className="text-[10px] font-bold text-content-subtle opacity-50 uppercase">{p.category_name}</div>
                       </td>
                       <td className="px-4 py-2 text-right tabular-nums font-black text-danger text-[11px]">{fmtNumber(p.stock, 2)}</td>
                       <td className="px-4 py-2 text-right tabular-nums text-[11px] text-content-subtle">{fmtNumber(p.min_stock, 2)}</td>
                       <td className="px-4 py-2 text-right tabular-nums text-brand-500 font-black text-[11px]">+{fmtNumber(p.needed, 2)}</td>
                       <td className="px-4 py-2 text-center"><StockBadge qty={p.stock} min={p.min_stock} /></td>
                     </tr>
                   ))
                 )}

                 {view === "zero" && (data.zero_stock.length === 0
                   ? <EMPTY msg="Sin productos agotados" />
                   : data.zero_stock.map((p, i) => (
                     <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                       <td className="px-4 py-2 font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{p.name}</td>
                       <td className="px-4 py-2 text-[11px] text-content-subtle">{p.category_name}</td>
                       <td className="px-4 py-2 text-right tabular-nums font-black text-danger text-[11px]">{fmtNumber(p.stock, 2)}</td>
                       <td className="px-4 py-2 text-center"><StockBadge qty={0} min={1} /></td>
                     </tr>
                   ))
                 )}

                 {view === "top" && (data.top_rotation.length === 0
                   ? <EMPTY msg="Sin ventas en este período" />
                   : data.top_rotation.map((p, i) => (
                     <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                       <td className="px-4 py-2">
                         <div className="flex items-center gap-2">
                           <span className="text-[10px] font-black text-content-subtle opacity-40 w-5 text-right">{i + 1}</span>
                           <span className="font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{p.name}</span>
                         </div>
                       </td>
                       <td className="px-4 py-2 text-right tabular-nums font-black text-success text-[11px]">{fmtNumber(p.units_sold, 2)}</td>
                       <td className="px-4 py-2 text-right tabular-nums font-black text-brand-500 text-[11px]">{fmt$(p.revenue)}</td>
                       <td className="px-4 py-2 text-right tabular-nums text-[11px] text-content-subtle">{fmtNumber(p.stock, 2)}</td>
                     </tr>
                   ))
                 )}

                 {view === "slow" && (data.low_rotation.length === 0
                   ? <EMPTY msg="Sin productos inmovilizados en este período" />
                   : data.low_rotation.map((p, i) => (
                     <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                       <td className="px-4 py-2 font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{p.name}</td>
                       <td className="px-4 py-2 text-[11px] text-content-subtle">{p.category_name}</td>
                       <td className="px-4 py-2 text-right tabular-nums text-[11px] text-content-subtle">{fmtNumber(p.stock, 2)}</td>
                       <td className="px-4 py-2 text-right tabular-nums font-black text-orange-500 text-[11px]">{fmt$(p.value_locked)}</td>
                     </tr>
                   ))
                 )}

                 {view === "category" && (data.by_category.length === 0
                   ? <EMPTY msg="Sin categorías con stock" />
                   : data.by_category.map((c, i) => (
                     <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                       <td className="px-4 py-2 font-black text-[11px] uppercase tracking-wider text-brand-500">{c.category_name}</td>
                       <td className="px-4 py-2 text-right font-bold text-[11px] text-content-subtle">{c.product_count} SKU</td>
                       <td className="px-4 py-2 text-right tabular-nums font-black text-[11px] text-content dark:text-white">{fmtInt(c.total_units)}</td>
                       <td className="px-4 py-2 text-right tabular-nums text-danger font-black text-[11px]">{fmt$(c.value_cost)}</td>
                     </tr>
                   ))
                 )}

               </tbody>
             </table>
           </div>
         </Card>
       </div>
     )}
   </div>
 );
}
