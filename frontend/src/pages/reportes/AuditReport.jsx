import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { buildAuditExcel } from "../../helpers/excel";
import { fmtDate, toNameCase } from "../../helpers";
import CustomSelect from "../../components/ui/CustomSelect";
import {
 fmt$, fmtN,
 useReport, defaultRange, usePagination, Pagination, useExportFull,
 DateRangePicker, KpiCard, SectionHeader, Card, Loading, ExportButton,
} from "./reportes.utils";

export default function AuditReport() {
 const [range, setRange] = useState(defaultRange(30));

 // Devoluciones y descuentos son cosa de la sucursal donde se dieron: mezclarlas entre
 // varias hace imposible saber a quién auditar.
 const [warehouseId, setWarehouseId] = useState("");
 const [warehouses, setWarehouses] = useState([]);
 useEffect(() => {
  api.warehouses.getAll()
   .then(r => setWarehouses((r.data || []).filter(w => w.sells !== false)))
   .catch(e => console.error("[AuditReport] no se pudieron cargar los almacenes:", e));
 }, []);
 const todasLabel = warehouses.length === 1 ? warehouses[0].name : "Todas las sucursales";

 const params = { date_from: range.from, date_to: range.to, warehouse_id: warehouseId };
 const { data, loading, error } = useReport(api.reports.audit, params, [range, warehouseId]);
 const exportFull = useExportFull(api.reports.audit, params, (d) => buildAuditExcel(d, range));
 const [view, setView] = useState("employees");
 const rs = data?.returns_summary;
 const returnsPag = usePagination(data?.returns_list ?? []);
 const discountsPag = usePagination(data?.discounts ?? []);

 const handleViewChange = (k) => { setView(k); returnsPag.setPage(1); discountsPag.setPage(1); };

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
 <KpiCard label="Devoluciones" value={fmtN(rs?.return_count || 0)} icon="" color="text-danger" />
 <KpiCard label="Monto reembolsado" value={fmt$(rs?.total_returned || 0)} icon="" color="text-danger" />
 <KpiCard label="Ventas c/ Descto." value={fmtN(data.discounts.length)} icon="" color="text-content dark:text-white" />
 <KpiCard label="Auditores activos" value={fmtN(data.by_employee.length)} icon="" color="text-content dark:text-white" />
 </div>

 <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide shrink-0">
 {[["employees", "Vendedores"], ["returns", "Devoluciones"], ["discounts", "Descuentos"]].map(([k, l]) => (
 <button key={k} onClick={() => handleViewChange(k)}
 className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all whitespace-nowrap border
 ${view === k ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "bg-surface-3 dark:bg-white/5 border-transparent text-content-muted dark:text-content-dark-muted opacity-60 hover:opacity-100"}`}>
 {l}
 </button>
 ))}
 </div>

 <Card className="!p-0 min-h-0 flex flex-col overflow-hidden">
 <div className="px-4 pt-4">
 <SectionHeader
 title={view === "employees" ? "Rendimiento" : view === "returns" ? "Control Merma" : "Supervisión"}
 sub="Trazabilidad operacional completa" />
 </div>

 <div className="overflow-x-auto">
 <table className="table-ledger min-w-[600px]">
 <thead>
 {view === "employees" && (
 <tr>
 {["Vendedor", "Ventas", "Ingresos", "Promedio", "Descto."].map((h, i) => (
 <th key={h} className={`px-4 ${i >= 1 ? "text-right" : ""}`}>{h}</th>
 ))}
 </tr>
 )}
 {view === "returns" && (
 <tr>
 {["ID / Cliente", "Motivo", "Total", "Fecha"].map((h, i) => (
 <th key={h} className={`px-4 ${i === 2 ? "text-right" : i === 3 ? "text-center" : ""}`}>{h}</th>
 ))}
 </tr>
 )}
 {view === "discounts" && (
 <tr>
 {["ID / Cliente", "Vendedor", "Descuento", "Total", "Fecha"].map((h, i) => (
 <th key={h} className={`px-4 ${i >= 2 && i <= 3 ? "text-right" : i === 4 ? "text-center" : ""}`}>{h}</th>
 ))}
 </tr>
 )}
 </thead>
 <tbody>
 {view === "employees" && data.by_employee.map((e, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2 font-bold text-[12px] text-content dark:text-white">{toNameCase(e.employee_name)}</td>
 <td className="px-4 py-2 text-right tabular-nums font-bold text-[12px] text-content-muted">{e.sale_count}</td>
 <td className="px-4 py-2 text-right tabular-nums text-content dark:text-white font-bold text-[12px]">{fmt$(e.revenue)}</td>
 <td className="px-4 py-2 text-right tabular-nums text-[12px] text-content-subtle">{fmt$(e.avg_ticket)}</td>
 <td className="px-4 py-2 text-right tabular-nums text-danger font-semibold text-[12px]">{parseFloat(e.total_discounts) > 0 ? fmt$(e.total_discounts) : "—"}</td>
 </tr>
 ))}
 {view === "returns" && (returnsPag.total === 0
 ? <tr><td colSpan={4} className="px-4 py-16 text-center text-[12px] font-bold text-content-subtle">Sin devoluciones en este período</td></tr>
 : returnsPag.paginated.map((r, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2">
 <div className="font-bold text-[12px] text-content dark:text-white">{toNameCase(r.customer_name) || "Venta Casual"}</div>
 <div className="text-[11px] font-semibold text-content-subtle uppercase">#{r.id}</div>
 </td>
 <td className="px-4 py-2 text-[12px] font-bold text-content-subtle">{r.reason || "Sin motivo"}</td>
 <td className="px-4 py-2 text-right tabular-nums text-danger font-bold text-[12px]">{fmt$(r.total)}</td>
 <td className="px-4 py-2 text-center text-[11px] font-bold text-content-subtle">{fmtDate(r.created_at)}</td>
 </tr>
 )))}
 {view === "discounts" && (discountsPag.total === 0
 ? <tr><td colSpan={5} className="px-4 py-16 text-center text-[12px] font-bold text-content-subtle">Sin descuentos aplicados en este período</td></tr>
 : discountsPag.paginated.map((d, i) => (
 <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
 <td className="px-4 py-2">
 <div className="font-bold text-[12px] text-content dark:text-white">{toNameCase(d.customer_name) || "Venta Casual"}</div>
 <div className="text-[11px] font-semibold text-content-subtle uppercase">#{d.id}</div>
 </td>
 <td className="px-4 py-2 text-[12px] text-content-subtle font-bold">{toNameCase(d.employee_name) || "—"}</td>
 <td className="px-4 py-2 text-right tabular-nums text-danger font-bold text-[12px]">{fmt$(d.discount_amount)}</td>
 <td className="px-4 py-2 text-right tabular-nums text-content dark:text-white font-bold text-[12px]">{fmt$(d.total)}</td>
 <td className="px-4 py-2 text-center text-[11px] font-bold text-content-subtle">{fmtDate(d.created_at)}</td>
 </tr>
 )))}
 </tbody>
 </table>
 </div>
 {view === "returns" && <Pagination page={returnsPag.page} totalPages={returnsPag.totalPages} total={returnsPag.total} onPage={returnsPag.setPage} />}
 {view === "discounts" && <Pagination page={discountsPag.page} totalPages={discountsPag.totalPages} total={discountsPag.total} onPage={discountsPag.setPage} />}
 </Card>
 </div>
 )}
 </div>
 );
}
