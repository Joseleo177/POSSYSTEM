import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { buildPurchasesExcel } from "../../helpers/excel";
import CustomSelect from "../../components/ui/CustomSelect";
import { toNameCase } from "../../helpers";
import {
 fmt$, fmtN,
 useReport, defaultRange, usePagination, Pagination, useExportFull,
 DateRangePicker, KpiCard, SectionHeader, Card, Loading, ExportButton,
} from "./reportes.utils";

export default function PurchasesReport() {
 const [range, setRange] = useState(defaultRange(30));

 // Sucursal que recibió la mercancía. Sin ella, dos tiendas veían mezcladas sus compras.
 const [warehouseId, setWarehouseId] = useState("");
 const [warehouses, setWarehouses] = useState([]);
 useEffect(() => {
  api.warehouses.getAll()
   .then(r => setWarehouses(r.data || []))
   .catch(e => console.error("[PurchasesReport] no se pudieron cargar los almacenes:", e));
 }, []);
 const todasLabel = warehouses.length === 1 ? warehouses[0].name : "Todas las sucursales";

 const params = { date_from: range.from, date_to: range.to, warehouse_id: warehouseId };
 const { data, loading, error } = useReport(api.reports.purchases, params, [range, warehouseId]);
 const exportFull = useExportFull(api.reports.purchases, params, (d) => buildPurchasesExcel(d, range));
 const s = data?.summary;
 const supplierPag = usePagination(data?.by_supplier ?? [], 20);
 const productPag = usePagination(data?.top_products ?? [], 20);

 return (
 <div className="h-full flex flex-col space-y-4 overflow-auto">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
 <div className="flex items-center gap-2 flex-wrap">
 <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
 {/* Con una sola sucursal no hay nada que elegir: mostrar el selector solo insinuaría que
     hay más, cuando no las hay. */}
 {warehouses.length > 1 && (
 <CustomSelect
  value={warehouseId}
  onChange={setWarehouseId}
  placeholder={todasLabel}
  boxClassName="h-10 min-w-[190px]"
  options={[
   { value: "", label: todasLabel },
   ...warehouses.map(w => ({ value: String(w.id), label: w.name }))
  ]}
 />
 )}
 </div>
 {data && <ExportButton onClick={exportFull.run} loading={exportFull.exporting} />}
 </div>

 {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
 {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-bold">{error}</div>}

 {!loading && !error && data && (
 <div className="flex-1 min-h-0 space-y-3 overflow-auto">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
 <KpiCard label="Órdenes compra" value={fmtN(s.total_orders || 0)} icon="" color="text-content dark:text-white" />
 <KpiCard label="Inversión" value={fmt$(s.total_cost || 0)} icon="" color="text-danger" />
 <KpiCard label="Ticket promedio" value={fmt$(s.avg_order || 0)} icon="" color="text-content dark:text-white" />
 <KpiCard label="Compra máxima" value={fmt$(s.max_order || 0)} icon="" color="text-content dark:text-white" />
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
 <Card className="!p-0 min-h-0 flex flex-col overflow-hidden">
 <div className="px-4 pt-4">
 <SectionHeader title="Principales aliados" sub="Gasto acumulado" />
 </div>
 <div className="overflow-x-auto">
 <table className="table-ledger min-w-[600px]">
 <thead>
 <tr>
 <th className="px-4">Proveedor</th>
 <th className="px-4 text-right">Inversión</th>
 </tr>
 </thead>
 <tbody>
 {supplierPag.total === 0
 ? <tr><td colSpan={2} className="px-4 py-10 text-center text-[12px] font-bold text-content-subtle">Sin compras en este período</td></tr>
 : supplierPag.paginated.map((sup, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2 font-bold text-[12px] text-content dark:text-white">{toNameCase(sup.supplier_name)}</td>
 <td className="px-4 py-2 text-right tabular-nums text-danger font-bold text-[12px]">{fmt$(sup.total_cost)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <Pagination page={supplierPag.page} totalPages={supplierPag.totalPages} total={supplierPag.total} onPage={supplierPag.setPage} />
 </Card>

 <Card className="!p-0 min-h-0 flex flex-col overflow-hidden">
 <div className="px-4 pt-4">
 <SectionHeader title="Abastecimiento" sub="Mayor volumen de compra" />
 </div>
 <div className="overflow-x-auto">
 <table className="table-ledger min-w-[600px]">
 <thead>
 <tr>
 <th className="px-4">Producto</th>
 <th className="px-4 text-right">Costo total</th>
 </tr>
 </thead>
 <tbody>
 {productPag.total === 0
 ? <tr><td colSpan={2} className="px-4 py-10 text-center text-[12px] font-bold text-content-subtle">Sin productos comprados</td></tr>
 : productPag.paginated.map((p, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2 font-bold text-[12px] text-content dark:text-white">{p.product_name}</td>
 <td className="px-4 py-2 text-right tabular-nums text-content dark:text-white font-bold text-[12px]">{fmt$(p.total_cost)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <Pagination page={productPag.page} totalPages={productPag.totalPages} total={productPag.total} onPage={productPag.setPage} />
 </Card>
 </div>
 </div>
 )}
 </div>
 );
}
