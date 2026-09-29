import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../services/api";
import { buildInventoryExcel } from "../../helpers/excel";
import { fmtNumber, fmtInt } from "../../helpers";
import {
  fmt$, fmtN,
  KpiCard, SectionHeader, Card, Loading, ExportButton, StockBadge,
} from "./reportes.utils";
import CustomSelect from "../../components/ui/CustomSelect";
import FilterPopover from "../../components/ui/FilterPopover";
import Segmented from "../../components/ui/Segmented";

const TH = ({ children, right, center }) => (
  <th className={`px-4 ${right ? "text-right" : center ? "text-center" : ""}`}>
    {children}
  </th>
);

const EMPTY = ({ msg = "Sin registros en este período" }) => (
  <tr><td colSpan={10} className="px-4 py-16 text-center text-[12px] font-bold text-content-subtle">{msg}</td></tr>
);

const LIMIT = 50;

// Fila de la vista móvil: el nombre ocupa todo el ancho y las cifras van debajo con su
// etiqueta, en lugar de una tabla de 600px que obligaba a desplazarse en horizontal.
const MobileRow = ({ lead, title, titleClass = "text-content dark:text-white", sub, badge, metrics }) => (
  <div className="px-4 py-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex items-start gap-2">
        {lead}
        <div className="min-w-0">
          <div className={`text-[12px] font-bold leading-snug break-words ${titleClass}`}>{title}</div>
          {sub && <div className="text-[11px] font-semibold text-content-subtle uppercase mt-0.5 break-words">{sub}</div>}
        </div>
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
      {metrics.map(m => (
        <div key={m.label} className="min-w-0">
          <div className="text-[12px] font-medium text-content-subtle/70">{m.label}</div>
          <div className={`text-[12px] tabular-nums font-bold ${m.className || "text-content dark:text-white"}`}>{m.value}</div>
        </div>
      ))}
    </div>
  </div>
);

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
  const filtrosBtnRef = useRef(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

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

  // En móvil los botones de página quedan al final de la lista: sin esto la página nueva
  // se veía desde abajo.
  const listTopRef = useRef(null);
  const goPage = (p) => {
    setPage(p);
    listTopRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const handleFilterChange = (setter) => (val) => {
    setter(val);
    setPage(1);
  };

  // Exportar: pide TODO el dataset (todas las secciones, sin paginar) con los filtros activos
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const r = await api.reports.inventory({
        days,
        warehouse_id: warehouseId,
        category_id: categoryId,
        search: debouncedSearch,
        view: "all",
        limit: 100000,
        offset: 0,
      });
      buildInventoryExcel(r.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const s = data?.summary;
  const totalItems = data?.total || 0;
  const totalPages = Math.ceil(totalItems / LIMIT);
  const hasActiveFilters = !!categoryId || !!warehouseId;
  // La lista de almacenes ya viene recortada a los del usuario.
  const allWarehousesLabel = warehouses.length === 1
    ? warehouses[0].name.toUpperCase()
    : "Todos mis almacenes";

  const mobileList = !data ? { rows: [], empty: "" } :
    view === "valuation" ? {
      empty: "Sin productos con existencia",
      rows: (data.valuation || []).map((p, i) => (
        <MobileRow key={i} title={p.name} sub={p.category_name} metrics={[
          { label: "Stock", value: `${fmtNumber(p.stock, 2)} ${p.unit || ""}` },
          { label: "Costo unit.", value: fmt$(p.cost_price) },
          { label: "Capital (Costo)", value: fmt$(p.value_cost), className: "text-content dark:text-white" },
          { label: "Valor venta", value: fmt$(p.value_sale), className: "text-content dark:text-white" },
        ]} />
      )),
    } :
    view === "critical" ? {
      empty: "Sin productos bajo nivel crítico",
      rows: (data.critical_stock || []).map((p, i) => (
        <MobileRow key={i} title={p.name}
          sub={p.warehouse_name ? `${p.warehouse_name} · ${p.category_name}` : p.category_name}
          badge={<StockBadge qty={p.stock} min={p.min_stock} />}
          metrics={[
            { label: "Stock", value: fmtNumber(p.stock, 2), className: "text-danger" },
            { label: "Mínimo", value: fmtNumber(p.min_stock, 2) },
            { label: "Faltante", value: `+${fmtNumber(p.needed, 2)}`, className: "text-content dark:text-white" },
          ]} />
      )),
    } :
    view === "zero" ? {
      empty: "Sin productos agotados",
      rows: (data.zero_stock || []).map((p, i) => (
        <MobileRow key={i} title={p.name} sub={p.category_name}
          badge={<StockBadge qty={0} min={1} />}
          metrics={[{ label: "Stock", value: fmtNumber(p.stock, 2), className: "text-danger" }]} />
      )),
    } :
    view === "top" ? {
      empty: "Sin ventas en este período",
      rows: (data.top_rotation || []).map((p, i) => (
        <MobileRow key={i} title={p.name}
          lead={<span className="text-[12px] font-bold text-content-subtle tabular-nums pt-px">{(page - 1) * LIMIT + i + 1}</span>}
          metrics={[
            { label: "Vendidas", value: fmtNumber(p.units_sold, 2), className: "text-content dark:text-white" },
            { label: "Ingresos", value: fmt$(p.revenue), className: "text-content dark:text-white" },
            { label: "Stock actual", value: fmtNumber(p.stock, 2) },
          ]} />
      )),
    } :
    view === "slow" ? {
      empty: "Sin productos inmovilizados en este período",
      rows: (data.low_rotation || []).map((p, i) => (
        <MobileRow key={i} title={p.name} sub={p.category_name} metrics={[
          { label: "Stock", value: fmtNumber(p.stock, 2) },
          { label: "Capital inmovilizado", value: fmt$(p.value_locked), className: "text-content dark:text-white" },
        ]} />
      )),
    } : {
      empty: "Sin categorías con stock",
      rows: (data.by_category || []).map((c, i) => (
        <MobileRow key={i} title={c.category_name} titleClass="text-content dark:text-white" metrics={[
          { label: "Surtido", value: `${c.product_count} SKU` },
          { label: "Unidades", value: fmtInt(c.total_units) },
          { label: "Costo total", value: fmt$(c.value_cost), className: "text-danger" },
        ]} />
      )),
    };

  return (
    // En escritorio el reporte se ajusta a la pantalla y solo la tabla se desplaza. En el
    // teléfono eso dejaba la lista en una franja de tres filas con su propio scroll, atrapada
    // bajo los KPIs: ahí la página crece y se desplaza entera.
    <div className="lg:h-full flex flex-col space-y-4 lg:overflow-hidden">
      {/* TOOLBAR PREMIUM ESTILO CONTABILIDAD */}
      {/* En tablet los tres controles no caben en una fila: el buscador cedía todo su ancho y
          quedaba reducido a la lupa. Hasta 1024px ocupa su propia fila completa y debajo van
          los filtros y la exportación; desde ahí vuelven a ir en línea. */}
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        {/* Buscador de Producto */}
        <div className="relative group basis-full lg:basis-auto lg:flex-1 min-w-0 order-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            autoComplete="off"
            placeholder="Buscar por nombre de producto o SKU..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input h-10 pl-10"
          />
        </div>

        {/* Botón de Filtros Dropdown */}
        <div className="relative order-2">
          <button
            ref={filtrosBtnRef}
            onClick={() => setShowFilterDrop(!showFilterDrop)}
            className={`h-10 px-3.5 rounded-lg text-[13px] font-medium border flex items-center gap-2 transition-colors
 ${hasActiveFilters
                ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40"
                : "bg-white dark:bg-white/5 border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:text-white"
              }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filtros
            {hasActiveFilters && (
              <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-content text-white dark:bg-white dark:text-black text-[10px] font-bold">
                {(categoryId ? 1 : 0) + (warehouseId ? 1 : 0)}
              </span>
            )}
          </button>

          <FilterPopover open={showFilterDrop} onClose={() => setShowFilterDrop(false)} anchorRef={filtrosBtnRef}>
            <div className="p-5">
              <div className="space-y-5">
                <header className="flex items-center justify-between border-b border-border/10 pb-3 mb-1">
                  <span className="text-[12px] font-medium text-content-subtle">Opciones de filtrado</span>
                </header>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-content-subtle/60 ml-1">Categoría</label>
                    <CustomSelect
                      value={categoryId}
                      onChange={handleFilterChange(setCategoryId)}
                      placeholder="Todas las categorías"
                      className="w-full"
                      options={[
                        { value: "", label: "Todas las categorías" },
                        ...categories.map(c => ({ value: String(c.id), label: c.name }))
                      ]}
                    />
                  </div>

                  {/* Con un solo almacén no hay nada que elegir: mostrar el selector solo
                        insinuaría que hay más, cuando no los hay. */}
                  {warehouses.length > 1 && (
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-medium text-content-subtle/60 ml-1">Almacén</label>
                      <CustomSelect
                        value={warehouseId}
                        onChange={handleFilterChange(setWarehouseId)}
                        placeholder={allWarehousesLabel}
                        className="w-full"
                        options={[
                          { value: "", label: allWarehousesLabel },
                          ...warehouses.map(w => ({ value: String(w.id), label: w.name }))
                        ]}
                      />
                    </div>
                  )}
                </div>

                <footer className="pt-2 border-t border-border/10 flex gap-2 pt-4">
                  <button
                    onClick={() => { setCategoryId(""); setWarehouseId(""); setShowFilterDrop(false); }}
                    className="flex-1 h-9 text-[13px] font-semibold btn-outline rounded-lg active:scale-[0.98]"
                  >
                    Limpiar todo
                  </button>
                  <button
                    onClick={() => setShowFilterDrop(false)}
                    className="flex-1 h-9 text-[13px] font-semibold btn-accent rounded-lg active:scale-[0.98]"
                  >
                    Cerrar
                  </button>
                </footer>
              </div>
            </div>
          </FilterPopover>
        </div>

        <div className="hidden lg:block h-10 border-l border-border/20 mx-1 order-2" />
        <div className="order-3 ml-auto lg:ml-0">
          {data && <ExportButton onClick={handleExport} loading={exporting} />}
        </div>
      </div>

      {loading && !data && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
      {error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-bold">{error}</div>}

      {data && (
        <div className={`lg:flex-1 lg:min-h-0 flex flex-col space-y-3 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
          {view === "valuation" ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Capital en stock (costo)" value={fmt$(s.stock_cost_value)} color="text-content dark:text-white" />
              <KpiCard label="Valor a precio de venta" value={fmt$(s.stock_sale_value)} color="text-content dark:text-white" />
              <KpiCard label="Utilidad potencial" value={fmt$((s.stock_sale_value || 0) - (s.stock_cost_value || 0))} color="text-content dark:text-white" />
              <KpiCard label="Unidades / producto" value={`${fmtInt(s.stock_units)} / ${fmtN(s.stock_skus)}`} color="text-content dark:text-white" />
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Nivel crítico" value={fmtN(s.critical_count)} color="text-danger" />
              <KpiCard label="Quiebre de stock" value={fmtN(s.zero_count)} color="text-danger" />
              <KpiCard label="Baja rotación" value={fmtN(s.low_rotation_count)} color="text-content dark:text-white" />
              <KpiCard label="Capital inmovilizado" value={fmt$(s.total_locked_value)} color="text-content dark:text-white" />
            </div>
          )}

          <div className="overflow-x-auto scrollbar-hide shrink-0">
            <Segmented
              value={view}
              onChange={(k) => { setView(k); setPage(1); }}
              options={[
                { key: "valuation", label: "Valorización" },
                { key: "critical",  label: "Crítico" },
                { key: "zero",      label: "Agotado" },
                { key: "top",       label: "Alta rotación" },
                { key: "slow",      label: "Sin movimiento" },
                { key: "category",  label: "Categorías" },
              ]}
            />
          </div>

          <Card className="!p-0 overflow-hidden lg:flex-1 flex flex-col lg:min-h-0 bg-transparent border-none shadow-none">
            <div ref={listTopRef} className="scroll-mt-3 p-4 pb-3 border-b border-border dark:border-white/5 bg-surface-1 dark:bg-surface-dark-1 rounded-t-xl border-x">
              <SectionHeader
                title={
                  view === "valuation" ? "Valorización de existencias" :
                    view === "critical" ? "Reposición urgente" :
                      view === "zero" ? "Inventario agotado" :
                        view === "top" ? "Productos de alta rotación" :
                          view === "slow" ? "Capital inmovilizado sin movimiento" :
                            "Valorización por categoría"
                }
                sub="Análisis operacional de existencia"
              />
            </div>

            <div className="lg:hidden bg-surface-1 dark:bg-surface-dark-1 border-x divide-y divide-border/20 dark:divide-white/5">
              {mobileList.rows.length === 0
                ? <div className="px-4 py-16 text-center text-[12px] font-bold text-content-subtle">{mobileList.empty}</div>
                : mobileList.rows}
            </div>

            <div className="hidden lg:block overflow-auto flex-1 bg-surface-1 dark:bg-surface-dark-1 border-x">
              <table className="table-ledger min-w-[600px]">
                <thead className="sticky top-0 z-10">
                  {view === "valuation" && (
                    <tr>
                      <TH>Producto</TH>
                      <TH>Categoría</TH>
                      <TH right>Stock</TH>
                      <TH right>Costo unit.</TH>
                      <TH right>Capital (Costo)</TH>
                      <TH right>Valor venta</TH>
                    </tr>
                  )}
                  {view === "critical" && (
                    <tr>
                      <TH>Producto</TH>
                      <TH right>Stock</TH>
                      <TH right>Mínimo</TH>
                      <TH right>Faltante</TH>
                      <TH center>Estado</TH>
                    </tr>
                  )}
                  {view === "zero" && (
                    <tr>
                      <TH>Producto</TH>
                      <TH>Categoría</TH>
                      <TH right>Stock</TH>
                      <TH center>Estado</TH>
                    </tr>
                  )}
                  {view === "top" && (
                    <tr>
                      <TH>Producto</TH>
                      <TH right>Unidades vendidas</TH>
                      <TH right>Ingresos</TH>
                      <TH right>Stock actual</TH>
                    </tr>
                  )}
                  {view === "slow" && (
                    <tr>
                      <TH>Producto</TH>
                      <TH>Categoría</TH>
                      <TH right>Stock</TH>
                      <TH right>Capital inmovilizado</TH>
                    </tr>
                  )}
                  {view === "category" && (
                    <tr>
                      <TH>Categoría</TH>
                      <TH right>Surtido</TH>
                      <TH right>Unidades</TH>
                      <TH right>Costo total</TH>
                    </tr>
                  )}
                </thead>

                <tbody>
                  {(loading && !data) ? (
                    <tr><td colSpan={10} className="py-20 text-center"><Loading /></td></tr>
                  ) : (
                    <>
                      {view === "valuation" && ((data.valuation || []).length === 0
                        ? <EMPTY msg="Sin productos con existencia" />
                        : data.valuation.map((p, i) => (
                          <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <td className="px-4 py-3 font-bold text-[12px] text-content dark:text-white">{p.name}</td>
                            <td className="px-4 py-3 text-[12px] text-content-subtle">{p.category_name}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[12px] text-content-subtle">{fmtNumber(p.stock, 2)} {p.unit}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[12px] text-content-subtle">{fmt$(p.cost_price)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-content dark:text-white text-[12px]">{fmt$(p.value_cost)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[12px] text-content dark:text-white">{fmt$(p.value_sale)}</td>
                          </tr>
                        ))
                      )}

                      {view === "critical" && ((data.critical_stock || []).length === 0
                        ? <EMPTY msg="Sin productos bajo nivel crítico" />
                        : data.critical_stock.map((p, i) => (
                          <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-bold text-[12px] text-content dark:text-white">{p.name}</div>
                              {/* Sin almacén elegido la falta es de una sucursal concreta, y el
                                  mismo producto puede aparecer por varias. */}
                              <div className="text-[11px] font-semibold text-content-subtle uppercase">
                                {p.warehouse_name ? `${p.warehouse_name} · ${p.category_name}` : p.category_name}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-danger text-[12px]">{fmtNumber(p.stock, 2)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[12px] text-content-subtle">{fmtNumber(p.min_stock, 2)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-content dark:text-white font-bold text-[12px]">+{fmtNumber(p.needed, 2)}</td>
                            <td className="px-4 py-3 text-center"><StockBadge qty={p.stock} min={p.min_stock} /></td>
                          </tr>
                        ))
                      )}

                      {view === "zero" && ((data.zero_stock || []).length === 0
                        ? <EMPTY msg="Sin productos agotados" />
                        : data.zero_stock.map((p, i) => (
                          <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <td className="px-4 py-3 font-bold text-[12px] text-content dark:text-white">{p.name}</td>
                            <td className="px-4 py-3 text-[12px] text-content-subtle">{p.category_name}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-danger text-[12px]">{fmtNumber(p.stock, 2)}</td>
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
                                <span className="text-[11px] font-bold text-content-subtle w-5 text-right">{(page - 1) * LIMIT + i + 1}</span>
                                <span className="font-bold text-[12px] text-content dark:text-white">{p.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-content dark:text-white text-[12px]">{fmtNumber(p.units_sold, 2)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-content dark:text-white text-[12px]">{fmt$(p.revenue)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[12px] text-content-subtle">{fmtNumber(p.stock, 2)}</td>
                          </tr>
                        ))
                      )}

                      {view === "slow" && ((data.low_rotation || []).length === 0
                        ? <EMPTY msg="Sin productos inmovilizados en este período" />
                        : data.low_rotation.map((p, i) => (
                          <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <td className="px-4 py-3 font-bold text-[12px] text-content dark:text-white">{p.name}</td>
                            <td className="px-4 py-3 text-[12px] text-content-subtle">{p.category_name}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-[12px] text-content-subtle">{fmtNumber(p.stock, 2)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-content dark:text-white text-[12px]">{fmt$(p.value_locked)}</td>
                          </tr>
                        ))
                      )}

                      {view === "category" && ((data.by_category || []).length === 0
                        ? <EMPTY msg="Sin categorías con stock" />
                        : data.by_category.map((c, i) => (
                          <tr key={i} className="hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <td className="px-4 py-3 font-bold text-[12px] text-content dark:text-white">{c.category_name}</td>
                            <td className="px-4 py-3 text-right font-semibold text-[12px] text-content-subtle">{c.product_count} SKU</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-[12px] text-content dark:text-white">{fmtInt(c.total_units)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-danger font-bold text-[12px]">{fmt$(c.value_cost)}</td>
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
              <div className="shrink-0 px-4 py-2 border-t border-border dark:border-white/5 bg-surface-2/50 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-x border-b">
                <div className="text-[12px] font-medium text-content-subtle leading-none whitespace-nowrap">
                  Total items: <span className="text-content dark:text-white">{totalItems}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button disabled={page === 1} onClick={() => goPage(1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 text-[11px] font-bold hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">«</button>
                  <button disabled={page === 1} onClick={() => goPage(page - 1)} className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 text-[11px] font-bold hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">Ant.</button>
                  <div className="px-3 h-7 flex items-center justify-center text-[11px] font-bold text-content dark:text-white bg-brand-500/10 rounded-lg border border-brand-500/20 whitespace-nowrap">Pág {page}/{totalPages}</div>
                  <button disabled={page === totalPages} onClick={() => goPage(page + 1)} className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 text-[11px] font-bold hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">Sig.</button>
                  <button disabled={page === totalPages} onClick={() => goPage(totalPages)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 text-[11px] font-bold hover:bg-brand-500 hover:text-black transition-all disabled:opacity-20 disabled:hover:bg-transparent">»</button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
