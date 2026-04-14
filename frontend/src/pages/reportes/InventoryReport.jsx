import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import { buildInventoryExcel } from "../../helpers/excel";
import { fmtNumber, fmtInt } from "../../helpers";
import {
  fmt$, fmtN,
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

const LIMIT = 50;

export default function InventoryReport() {
  const [days, setDays] = useState(30);
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [warehouses, setWarehouses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [view, setView] = useState("critical");
  const [page, setPage] = useState(1);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showFilterDrop, setShowFilterDrop] = useState(false);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    Promise.all([
      api.warehouses.getAll(),
      api.categories.getAll()
    ]).then(([wR, cR]) => {
      setWarehouses(wR.data);
      setCategories(cR.data);
    }).catch(console.error);
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        days,
        warehouse_id: warehouseId,
        category_id: categoryId,
        search: debouncedSearch,
        view,
        limit: LIMIT,
        offset: (page - 1) * LIMIT
      };
      const r = await api.reports.inventory(params);
      setData(r.data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [days, warehouseId, categoryId, debouncedSearch, view, page]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const handleFilterChange = (setter) => (val) => {
    setter(val);
    setPage(1);
  };

  const s = data?.summary;
  const totalItems = data?.total || 0;
  const totalPages = Math.ceil(totalItems / LIMIT);
  const hasActiveFilters = !!categoryId || !!warehouseId;

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      {/* TOOLBAR PREMIUM ESTILO CONTABILIDAD */}
      <div className="shrink-0 flex items-center gap-2">
        {/* Buscador de Producto */}
        <div className="relative flex-1 group">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle opacity-40 group-focus-within:opacity-100 group-focus-within:text-brand-500 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre de producto o SKU..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-10 pl-10 pr-4 bg-surface-2 dark:bg-white/[0.03] border border-border/40 dark:border-white/5 rounded-xl text-[11px] font-bold tracking-wide focus:border-brand-500/50 focus:ring-4 focus:ring-brand-500/5 outline-none transition-all placeholder:text-content-subtle/50"
          />
        </div>

        {/* Botón de Filtros Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowFilterDrop(!showFilterDrop)}
            className={`h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-2.5 transition-all
              ${hasActiveFilters 
                ? "bg-brand-500 text-black border-brand-500 shadow-lg shadow-brand-500/20" 
                : "bg-surface-2 dark:bg-white/5 border-border/30 text-content-subtle hover:text-content hover:border-content/20"
              }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            FILTROS
            {hasActiveFilters && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black/20 text-[9px] font-black">
                {(categoryId ? 1 : 0) + (warehouseId ? 1 : 0)}
              </span>
            )}
          </button>

          {showFilterDrop && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
              <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-[#1a1a1a] border border-border/40 dark:border-white/10 rounded-2xl shadow-2xl z-[70] p-5 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="space-y-5">
                  <header className="flex items-center justify-between border-b border-border/10 pb-3 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Opciones de filtrado</span>
                  </header>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-content-subtle/60 ml-1">Categoría</label>
                      <CustomSelect
                        value={categoryId}
                        onChange={handleFilterChange(setCategoryId)}
                        placeholder="TODAS LAS CATEGORÍAS"
                        className="w-full"
                        options={[
                          { value: "", label: "TODAS LAS CATEGORÍAS" },
                          ...categories.map(c => ({ value: String(c.id), label: c.name }))
                        ]}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-content-subtle/60 ml-1">Almacén</label>
                      <CustomSelect
                        value={warehouseId}
                        onChange={handleFilterChange(setWarehouseId)}
                        placeholder="TODOS LOS ALMACENES"
                        className="w-full"
                        options={[
                          { value: "", label: "TODOS LOS ALMACENES" },
                          ...warehouses.map(w => ({ value: String(w.id), label: w.name }))
                        ]}
                      />
                    </div>
                  </div>

                  <footer className="pt-2 border-t border-border/10 flex gap-2 pt-4">
                    <button
                      onClick={() => { setCategoryId(""); setWarehouseId(""); setShowFilterDrop(false); }}
                      className="flex-1 py-2.5 text-[9px] font-black uppercase tracking-tighter text-danger hover:bg-danger/5 rounded-xl border border-danger/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      Limpiar Todo
                    </button>
                    <button
                      onClick={() => setShowFilterDrop(false)}
                      className="flex-2 px-6 py-2.5 bg-surface-3 dark:bg-white/10 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-surface-4 dark:hover:bg-white/20 transition-all"
                    >
                      Cerrar
                    </button>
                  </footer>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="h-10 border-l border-border/20 mx-1" />
        {data && <ExportButton onClick={() => buildInventoryExcel(data)} />}
      </div>

      {loading && !data && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
      {error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-black uppercase tracking-wide">{error}</div>}

      {data && (
        <div className={`flex-1 min-h-0 flex flex-col space-y-3 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
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
              <button key={k} onClick={() => { setView(k); setPage(1); }}
                className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all whitespace-nowrap border
                ${view === k ? "bg-brand-500 text-black border-brand-500 shadow-lg shadow-brand-500/20" : "bg-surface-3 dark:bg-white/5 border-transparent text-content-muted dark:text-content-dark-muted opacity-60 hover:opacity-100"}`}>
                {l}
              </button>
            ))}
          </div>

          <Card className="!p-0 overflow-hidden flex-1 flex flex-col min-h-0 bg-transparent border-none shadow-none">
            <div className="p-4 pb-3 border-b border-border dark:border-white/5 bg-surface-1 dark:bg-surface-dark-1 rounded-t-xl border-x">
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
            
            <div className="overflow-auto flex-1 bg-surface-1 dark:bg-surface-dark-1 border-x">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="bg-surface-2 dark:bg-surface-dark-2/50 sticky top-0 z-10">
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
                  {(loading && !data) ? (
                     <tr><td colSpan={10} className="py-20 text-center"><Loading /></td></tr>
                  ) : (
                    <>
                      {view === "critical" && ((data.critical_stock || []).length === 0
                        ? <EMPTY msg="Sin productos bajo nivel crítico" />
                        : data.critical_stock.map((p, i) => (
                          <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{p.name}</div>
                              <div className="text-[10px] font-bold text-content-subtle opacity-50 uppercase">{p.category_name}</div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-black text-danger text-[11px]">{fmtNumber(p.stock, 2)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[11px] text-content-subtle">{fmtNumber(p.min_stock, 2)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-brand-500 font-black text-[11px]">+{fmtNumber(p.needed, 2)}</td>
                            <td className="px-4 py-3 text-center"><StockBadge qty={p.stock} min={p.min_stock} /></td>
                          </tr>
                        ))
                      )}

                      {view === "zero" && ((data.zero_stock || []).length === 0
                        ? <EMPTY msg="Sin productos agotados" />
                        : data.zero_stock.map((p, i) => (
                          <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <td className="px-4 py-3 font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{p.name}</td>
                            <td className="px-4 py-3 text-[11px] text-content-subtle">{p.category_name}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-black text-danger text-[11px]">{fmtNumber(p.stock, 2)}</td>
                            <td className="px-4 py-3 text-center"><StockBadge qty={0} min={1} /></td>
                          </tr>
                        ))
                      )}

                      {view === "top" && ((data.top_rotation || []).length === 0
                        ? <EMPTY msg="Sin ventas en este período" />
                        : data.top_rotation.map((p, i) => (
                          <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-content-subtle opacity-40 w-5 text-right">{(page-1)*LIMIT + i + 1}</span>
                                <span className="font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{p.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-black text-success text-[11px]">{fmtNumber(p.units_sold, 2)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-black text-brand-500 text-[11px]">{fmt$(p.revenue)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[11px] text-content-subtle">{fmtNumber(p.stock, 2)}</td>
                          </tr>
                        ))
                      )}

                      {view === "slow" && ((data.low_rotation || []).length === 0
                        ? <EMPTY msg="Sin productos inmovilizados en este período" />
                        : data.low_rotation.map((p, i) => (
                          <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <td className="px-4 py-3 font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{p.name}</td>
                            <td className="px-4 py-3 text-[11px] text-content-subtle">{p.category_name}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[11px] text-content-subtle">{fmtNumber(p.stock, 2)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-black text-orange-500 text-[11px]">{fmt$(p.value_locked)}</td>
                          </tr>
                        ))
                      )}

                      {view === "slow" && ((data.low_rotation || []).length === 0
                        ? <EMPTY msg="Sin productos inmovilizados en este período" />
                        : data.low_rotation.map((p, i) => (
                          <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <td className="px-4 py-3 font-black text-[11px] uppercase tracking-wider text-content dark:text-white">{p.name}</td>
                            <td className="px-4 py-3 text-[11px] text-content-subtle">{p.category_name}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[11px] text-content-subtle">{fmtNumber(p.stock, 2)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-black text-orange-500 text-[11px]">{fmt$(p.value_locked)}</td>
                          </tr>
                        ))
                      )}

                      {view === "category" && ((data.by_category || []).length === 0
                        ? <EMPTY msg="Sin categorías con stock" />
                        : data.by_category.map((c, i) => (
                          <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <td className="px-4 py-3 font-black text-[11px] uppercase tracking-wider text-brand-500">{c.category_name}</td>
                            <td className="px-4 py-3 text-right font-bold text-[11px] text-content-subtle">{c.product_count} SKU</td>
                            <td className="px-4 py-3 text-right tabular-nums font-black text-[11px] text-content dark:text-white">{fmtInt(c.total_units)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-danger font-black text-[11px]">{fmt$(c.value_cost)}</td>
                          </tr>
                        ))
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* BARRA DE PAGINACIÓN */}
            {totalPages > 1 && (
              <div className="shrink-0 px-4 py-2 border-t border-border dark:border-white/5 bg-surface-2/50 dark:bg-white/[0.02] flex items-center justify-between rounded-b-xl border-x border-b">
                <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest leading-none">
                  Total items: <span className="text-content dark:text-white">{totalItems}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button disabled={page === 1} onClick={() => setPage(1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">«</button>
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">Ant.</button>
                  <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">Pág {page}/{totalPages}</div>
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">Sig.</button>
                  <button disabled={page === totalPages} onClick={() => setPage(totalPages)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">»</button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
