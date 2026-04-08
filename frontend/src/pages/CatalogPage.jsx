import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import ProductModal from "../components/ProductModal";
import ConfirmModal from "../components/ConfirmModal";
import { fmtBase } from "../helpers";
import { useDebounce } from "../hooks/useDebounce";

export default function CatalogPage() {
  const { notify, can, baseCurrency, categories, loadCategories, employee } = useApp();
  const canManageProducts   = can("products") || can("config");
  const canManageCategories = can("config");

  const [subTab, setSubTab]         = useState("productos");
  const [products, setProducts]     = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [page, setPage]             = useState(1);
  const LIMIT = 50;
  const [search, setSearch]         = useState("");
  const debouncedSearch             = useDebounce(search, 400);
  const [loading, setLoading]       = useState(false);
  const [productModal, setProductModal]     = useState(false);
  const [productEditData, setProductEditData] = useState(null);
  const [editId, setEditId]                   = useState(null);
  const [catName, setCatName]               = useState("");
  const [catEditId, setCatEditId]           = useState(null);
  const [catEditName, setCatEditName]       = useState("");
  const [deleteProductDialog, setDeleteProductDialog]   = useState(null);
  const [deleteCategoryDialog, setDeleteCategoryDialog] = useState(null);
  const [selectedWarehouseId, setSelectedWarehouseId]   = useState("");
  const [warehouses, setWarehouses]                      = useState([]);

  const fmtPrice = (n) => fmtBase(n, baseCurrency);

  useEffect(() => {
    Promise.all([
      api.warehouses.getAll(),
      employee?.id ? api.warehouses.getByEmployee(employee.id) : Promise.resolve({ data: [] })
    ]).then(([allRes, myRes]) => {
      setWarehouses(allRes.data);
      const activeId = localStorage.getItem("activeWarehouseId");
      if (activeId) { setSelectedWarehouseId(activeId); return; }
      const myWH = myRes?.data ?? [];
      if (myWH.length === 1) { setSelectedWarehouseId(String(myWH[0].id)); return; }
    });
  }, [employee?.id]);

  useEffect(() => { setPage(1); }, [debouncedSearch, selectedWarehouseId]);

  const loadProducts = async () => {
    try {
      const q = { limit: LIMIT, offset: (page - 1) * LIMIT };
      if (debouncedSearch) q.search = debouncedSearch;
      if (selectedWarehouseId) q.warehouse_id = selectedWarehouseId;
      const r = await api.products.getAll(q);
      setProducts(r.data);
      setTotalProducts(r.total || r.data.length);
    } catch (e) { notify(e.message, "err"); }
  };

  useEffect(() => { loadProducts(); }, [page, debouncedSearch, selectedWarehouseId]);

  const openNewProduct  = () => { setProductEditData(null); setEditId(null); setProductModal(true); };
  const openEditProduct = (p) => { setEditId(p.id); setProductEditData(p); setProductModal(true); };
  const closeModal      = () => { setProductModal(false); setProductEditData(null); setEditId(null); };

  const saveProduct = async (form, imageFile) => {
    if (!canManageProducts) return notify("Sin permisos", "err");
    const { name, price, stock, category_id, unit, qty_step, is_combo, combo_items, is_service, min_stock, cost_price, profit_margin, package_unit, package_size } = form;
    if (!name || !price) return notify("Nombre y precio requeridos", "err");
    setLoading(true);
    try {
      const payload = {
        name, price: +price, stock: +stock,
        category_id: category_id || null,
        unit: unit || "unidad", qty_step: +qty_step || 1,
        is_combo: !!is_combo, is_service: !!is_service,
        combo_items: is_combo ? JSON.stringify(combo_items) : "[]",
        min_stock: +min_stock || 0, cost_price: +cost_price || 0,
        profit_margin: +profit_margin || 0,
        package_unit: package_unit || "", package_size: +package_size || 0,
      };
      if (editId !== null) { await api.products.update(editId, payload, imageFile); notify("Producto actualizado"); }
      else                 { await api.products.create(payload, imageFile);          notify("Producto creado"); }
      closeModal(); loadProducts();
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  };

  const createCategory  = async () => {
    if (!catName.trim()) return;
    try { await api.categories.create({ name: catName.trim() }); notify("Categoría creada"); setCatName(""); loadCategories(); }
    catch (e) { notify(e.message, "err"); }
  };
  const updateCategory  = async () => {
    if (!catEditName.trim()) return;
    try { await api.categories.update(catEditId, { name: catEditName.trim() }); notify("Categoría actualizada"); setCatEditId(null); setCatEditName(""); loadCategories(); }
    catch (e) { notify(e.message, "err"); }
  };
  const confirmDeleteProduct  = async () => {
    if (!deleteProductDialog) return;
    try { await api.products.remove(deleteProductDialog); notify("Eliminado"); loadProducts(); setDeleteProductDialog(null); }
    catch (e) { notify(e.message, "err"); }
  };
  const confirmDeleteCategory = async () => {
    if (!deleteCategoryDialog) return;
    try { await api.categories.remove(deleteCategoryDialog); notify("Eliminada"); loadCategories(); setDeleteCategoryDialog(null); }
    catch (e) { notify(e.message, "err"); }
  };

  const stockColor = (s) => { const n = parseFloat(s); return n <= 0 ? "text-danger" : n <= 5 ? "text-warning" : "text-success"; };
  const stockBar   = (s) => { const n = parseFloat(s); return n <= 0 ? "bg-danger" : n <= 5 ? "bg-warning" : "bg-success"; };
  const lowStock  = products.filter(p => parseFloat(p.stock) <= 5);
  const totalPages = Math.ceil(totalProducts / LIMIT);

  return (
    <div className="h-full flex flex-col bg-transparent ">

      {/* ── Header compacto ──────────────────────────────── */}
      <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
        <div>
          <div className="text-[10px] font-black text-brand-500 uppercase tracking-[3px] leading-none mb-0.5">MÓDULO DE INVENTARIO</div>
          <h1 className="text-sm font-black text-content dark:text-white uppercase tracking-tight leading-none">Gestión de Catálogo</h1>
        </div>

        {lowStock.length > 0 && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-danger/5 border border-danger/20 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
            <span className="text-[9px] font-black text-danger uppercase tracking-widest">{lowStock.length} stock crítico</span>
          </div>
        )}

        {canManageProducts && subTab === "productos" && (
          <button onClick={openNewProduct} className="px-3 py-1.5 bg-brand-500 text-black rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-400 transition-all shadow-lg shadow-brand-500/20 active:scale-95 shrink-0">
            + Nuevo Producto
          </button>
        )}
        {canManageCategories && subTab === "categorias" && (
          <div className="flex items-center gap-2">
            <input value={catName} onChange={e => setCatName(e.target.value)} onKeyDown={e => e.key === "Enter" && createCategory()}
              placeholder="Nueva categoría..." className="h-7 px-2.5 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/5 rounded-lg text-[9px] font-bold focus:ring-2 focus:ring-brand-500/20 outline-none transition-all w-48" />
            <button onClick={createCategory} className="px-3 py-1.5 bg-brand-500 text-black rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-400 transition-all active:scale-95 shrink-0">+ Crear</button>
          </div>
        )}
      </div>

      {/* ── Sub-tabs + Filtros ───────────────────────────── */}
      <div className="shrink-0 px-4 py-1.5 flex items-center justify-between gap-3 border-b border-border/20 dark:border-white/5 bg-surface-1/30 dark:bg-white/[0.02]">
        {/* Tabs */}
        <div className="flex items-center gap-1">
          {[["productos", "Productos"], ["categorias", "Categorías"]].map(([key, label]) => (
            <button key={key} onClick={() => setSubTab(key)}
              className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${subTab === key ? "bg-brand-500 text-black shadow-[0_0_12px_rgba(20,184,166,0.3)]" : "text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/5"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Filtros solo en productos */}
        {subTab === "productos" && (
          <div className="flex items-center gap-2 flex-1 max-w-xl justify-end">
            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-content-subtle dark:text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto..." className="w-full h-7 pl-7 pr-3 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/5 rounded-lg text-[9px] font-bold focus:ring-2 focus:ring-brand-500/20 outline-none transition-all" />
            </div>
            <select value={selectedWarehouseId} onChange={e => setSelectedWarehouseId(e.target.value)}
              className="h-7 px-2.5 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/5 rounded-lg text-[9px] font-black focus:ring-2 focus:ring-brand-500/20 outline-none transition-all max-w-[180px]">
              <option value="">Inventario Global</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>Almacén: {w.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Contenido ────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">

        {/* PRODUCTOS */}
        {subTab === "productos" && (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 backdrop-blur-md">
                  <tr className="border-b border-border/30 dark:border-white/5">
                    <th className="px-4 py-2.5 w-12" />
                    <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Producto</th>
                    <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Stock</th>
                    <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Precio</th>
                    {canManageProducts && <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 dark:divide-white/5">
                  {products.length === 0 ? (
                    <tr><td colSpan={5} className="p-10 text-center text-[9px] font-black uppercase tracking-widest opacity-20">Sin productos registrados</td></tr>
                  ) : products.map(p => {
                    const localStock  = parseFloat(p.warehouse_stock ?? p.stock);
                    const globalStock = parseFloat(p.stock);
                    const hasLocal    = !!selectedWarehouseId;
                    return (
                      <tr key={p.id} className="group hover:bg-surface-1/50 dark:hover:bg-white/[0.03] transition-colors">
                        <td className="px-4 py-2 w-12">
                          {p.image_url
                            ? <img src={p.image_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-border/20 dark:border-white/5" />
                            : <div className="w-9 h-9 rounded-lg bg-surface-3 dark:bg-white/5 border border-border/20 dark:border-white/5 flex items-center justify-center text-[9px] font-black text-content-subtle dark:text-white/30">{p.name.charAt(0)}</div>
                          }
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-[10px] font-black text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">{p.name}</div>
                          <div className="text-[9px] font-bold text-content-subtle dark:text-white/30 mt-0.5 uppercase tracking-widest">{p.category_name || "Sin categoría"}</div>
                        </td>
                        <td className="px-4 py-2">
                          <div className={`text-[11px] font-black tabular-nums ${stockColor(localStock)}`}>
                            {localStock}
                            <span className="text-[10px] ml-1 opacity-50 uppercase">{p.unit || "uds"}</span>
                          </div>
                          {hasLocal && globalStock !== localStock && (
                            <div className="text-[10px] font-bold opacity-30 uppercase">Global: {globalStock}</div>
                          )}
                          <div className="w-16 h-0.5 bg-surface-3 dark:bg-white/5 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${stockBar(localStock)}`} style={{ width: `${Math.min((localStock / 50) * 100, 100)}%` }} />
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-[11px] font-black text-brand-500 tabular-nums">{fmtPrice(p.price)}</div>
                          <div className="text-[10px] font-bold opacity-30 uppercase">precio final</div>
                        </td>
                        {canManageProducts && (
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={() => openEditProduct(p)} className="w-7 h-7 rounded-lg bg-warning/10 text-warning border border-warning/20 hover:bg-warning hover:text-black transition-all active:scale-90 flex items-center justify-center">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                              </button>
                              <button onClick={() => setDeleteProductDialog(p.id)} className="w-7 h-7 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all active:scale-90 flex items-center justify-center">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación compacta */}
            {totalPages > 1 && (
              <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-border/20 dark:border-white/5 bg-surface-1/30 dark:bg-white/[0.02]">
                <span className="text-[9px] font-black uppercase tracking-widest opacity-30">{totalProducts} productos</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-6 h-6 rounded flex items-center justify-center bg-surface-2 dark:bg-white/5 border border-border/20 dark:border-white/5 text-content-subtle hover:text-brand-500 disabled:opacity-20 transition-all">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40 px-2">{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-6 h-6 rounded flex items-center justify-center bg-surface-2 dark:bg-white/5 border border-border/20 dark:border-white/5 text-content-subtle hover:text-brand-500 disabled:opacity-20 transition-all">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CATEGORÍAS */}
        {subTab === "categorias" && (
          <div className="h-full overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 backdrop-blur-md">
                <tr className="border-b border-border/30 dark:border-white/5">
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Nombre</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Productos</th>
                  {canManageCategories && <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 dark:divide-white/5">
                {categories.length === 0 ? (
                  <tr><td colSpan={3} className="p-10 text-center text-[9px] font-black uppercase tracking-widest opacity-20">Sin categorías</td></tr>
                ) : categories.map(cat => (
                  <tr key={cat.id} className="group hover:bg-surface-1/50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-2.5">
                      {catEditId === cat.id ? (
                        <div className="flex items-center gap-2">
                          <input value={catEditName} onChange={e => setCatEditName(e.target.value)} autoFocus
                            className="h-7 px-2.5 bg-surface-2 dark:bg-white/10 border border-brand-500/30 rounded-lg text-[9px] font-black outline-none flex-1 max-w-xs" />
                          <button onClick={updateCategory} className="w-7 h-7 rounded-lg bg-success/10 text-success border border-success/20 hover:bg-success hover:text-black transition-all flex items-center justify-center">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                          </button>
                          <button onClick={() => { setCatEditId(null); setCatEditName(""); }} className="w-7 h-7 rounded-lg bg-surface-3 dark:bg-white/10 text-content hover:bg-danger/10 hover:text-danger transition-all flex items-center justify-center">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-black uppercase text-content dark:text-white tracking-tight group-hover:text-brand-500 transition-colors">{cat.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 text-[9px] font-black uppercase tracking-widest border border-brand-500/10">
                        {products.filter(p => p.category_id === cat.id).length} productos
                      </span>
                    </td>
                    {canManageCategories && (
                      <td className="px-4 py-2.5 text-right">
                        {catEditId !== cat.id && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => { setCatEditId(cat.id); setCatEditName(cat.name); }} className="w-7 h-7 rounded-lg bg-warning/10 text-warning border border-warning/20 hover:bg-warning hover:text-black transition-all active:scale-90 flex items-center justify-center">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                            </button>
                            <button onClick={() => setDeleteCategoryDialog(cat.id)} className="w-7 h-7 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all active:scale-90 flex items-center justify-center">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modales */}
      <ProductModal open={productModal} onClose={closeModal} onSave={saveProduct} editData={productEditData} categories={categories} loading={loading} />
      <ConfirmModal isOpen={!!deleteProductDialog} title="¿Eliminar Producto?" message="Esta acción no se puede deshacer." onConfirm={confirmDeleteProduct} onCancel={() => setDeleteProductDialog(null)} type="danger" confirmText="Sí, eliminar" />
      <ConfirmModal isOpen={!!deleteCategoryDialog} title="¿Eliminar Categoría?" message="Los productos vinculados quedarán sin categoría." onConfirm={confirmDeleteCategory} onCancel={() => setDeleteCategoryDialog(null)} type="danger" confirmText="Sí, eliminar" />
    </div>
  );
}
