import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import ProductModal from "../components/ProductModal";
import ConfirmModal from "../components/ConfirmModal";
import DataTable from "../components/DataTable";
import { fmtBase } from "../helpers";
import { useDebounce } from "../hooks/useDebounce";

export default function CatalogPage() {
  const { notify, can, baseCurrency, categories, loadCategories, employee } = useApp();
  const canManageProducts = can("products") || can("config");
  const canManageCategories = can("config");
  const isAdmin = !!employee?.permissions?.all;

  const [subTab, setSubTab]     = useState("productos"); // productos | categorias
  const [products, setProducts] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 50;
  
  const [search, setSearch]     = useState("");
  const debouncedSearch         = useDebounce(search, 400);
  const [loading, setLoading]   = useState(false);

  // Product modal
  const [productModal, setProductModal]       = useState(false);
  const [productEditData, setProductEditData] = useState(null);
  const [editId, setEditId]                   = useState(null);

  // Category management
  const [catName,     setCatName]     = useState("");
  const [catEditId,   setCatEditId]   = useState(null);
  const [catEditName, setCatEditName] = useState("");

  const [deleteProductDialog, setDeleteProductDialog] = useState(null); // id
  const [deleteCategoryDialog, setDeleteCategoryDialog] = useState(null); // id
  
  // Warehouse filtering for localized stock
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState([]);

  const fmtPrice = (n) => fmtBase(n, baseCurrency);

  // ── Loaders ────────────────────────────────────────────────
  useEffect(() => {
    // Load warehouses for selector
    api.warehouses.getAll().then(r => {
      setWarehouses(r.data);
      // Try to match the POS active warehouse if it exists in local storage or session
      const activeId = localStorage.getItem("activeWarehouseId");
      if (activeId) setSelectedWarehouseId(activeId);
    });
  }, []);

  useEffect(() => { setPage(1); }, [debouncedSearch, selectedWarehouseId]);
  
  const loadProducts = async () => {
    try { 
      const q = { limit: LIMIT, offset: (page - 1) * LIMIT };
      if (debouncedSearch) q.search = debouncedSearch;
      if (selectedWarehouseId) q.warehouse_id = selectedWarehouseId;
      const r = await api.products.getAll(q); 
      setProducts(r.data); 
      setTotalProducts(r.total || r.data.length);
    }
    catch (e) { notify(e.message, "err"); }
  };

  useEffect(() => { loadProducts(); }, [page, debouncedSearch, selectedWarehouseId]);

  // ── Product CRUD ───────────────────────────────────────────
  const openNewProduct  = () => { setProductEditData(null); setEditId(null); setProductModal(true); };
  const openEditProduct = (p) => { setEditId(p.id); setProductEditData(p); setProductModal(true); };
  const closeModal      = () => { setProductModal(false); setProductEditData(null); setEditId(null); };

  const saveProduct = async (form, imageFile) => {
    if (!canManageProducts) return notify("No tienes permisos para esta acción", "err");
    const { name, price, stock, category_id, unit, qty_step, is_combo, combo_items, is_service, min_stock, cost_price, profit_margin, package_unit, package_size } = form;
    if (!name || !price) return notify("Nombre y precio son requeridos", "err");
    if (is_combo && combo_items.length === 0) return notify("Un combo debe tener al menos un ingrediente", "err");
    setLoading(true);
    try {
      const payload = {
        name, price: +price, stock: +stock,
        category_id: category_id || null,
        unit: unit || "unidad",
        qty_step: +qty_step || 1,
        is_combo: !!is_combo,
        is_service: !!is_service,
        combo_items: is_combo ? JSON.stringify(combo_items) : "[]",
        min_stock: +min_stock || 0,
        cost_price: +cost_price || 0,
        profit_margin: +profit_margin || 0,
        package_unit: package_unit || "",
        package_size: +package_size || 0,
      };
      if (editId !== null) { await api.products.update(editId, payload, imageFile); notify("Producto actualizado"); }
      else                 { await api.products.create(payload, imageFile);          notify("Producto agregado"); }
      closeModal(); loadProducts(search);
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  };

  const deleteProduct = (id) => {
    if (!canManageProducts) return notify("No tienes permisos para esta acción", "err");
    setDeleteProductDialog(id);
  };

  const confirmDeleteProduct = async () => {
    if (!deleteProductDialog) return;
    try { 
      await api.products.remove(deleteProductDialog); 
      notify("Producto eliminado"); 
      loadProducts(search); 
      setDeleteProductDialog(null);
    } catch (e) { notify(e.message, "err"); }
  };

  // ── Category CRUD ──────────────────────────────────────────
  const createCategory = async () => {
    if (!canManageCategories) return notify("No tienes permisos para esta acción", "err");
    if (!catName.trim()) return notify("Nombre requerido", "err");
    try { await api.categories.create({ name: catName.trim() }); notify("Categoría creada"); setCatName(""); loadCategories(); }
    catch (e) { notify(e.message, "err"); }
  };

  const updateCategory = async () => {
    if (!canManageCategories) return notify("No tienes permisos para esta acción", "err");
    if (!catEditName.trim()) return notify("Nombre requerido", "err");
    try { await api.categories.update(catEditId, { name: catEditName.trim() }); notify("Categoría actualizada"); setCatEditId(null); setCatEditName(""); loadCategories(); }
    catch (e) { notify(e.message, "err"); }
  };

  const deleteCategory = (id) => {
    if (!canManageCategories) return notify("No tienes permisos para esta acción", "err");
    setDeleteCategoryDialog(id);
  };

  const confirmDeleteCategory = async () => {
    if (!deleteCategoryDialog) return;
    try { 
      await api.categories.remove(deleteCategoryDialog); 
      notify("Categoría eliminada"); 
      loadCategories(); 
      setDeleteCategoryDialog(null);
    } catch (e) { notify(e.message, "err"); }
  };

  const lowStock = products.filter(p => parseFloat(p.stock) <= 5);

  const stockColorClass = (stock) => {
    const s = parseFloat(stock);
    if (s <= 5)  return "text-danger";
    if (s <= 20) return "text-warning";
    return "text-success";
  };

  const stockBarClass = (stock) => {
    const s = parseFloat(stock);
    if (s <= 5)  return "bg-danger";
    if (s <= 20) return "bg-warning";
    return "bg-success";
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* ── Header & Sub-tabs ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border/40 pb-2">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-content dark:text-content-dark uppercase font-display mb-4">
            Gestión de <span className="text-brand-500">Inventario</span>
          </h1>
          <div className="flex gap-2">
            {[[ "productos", "Productos" ], [ "categorias", "Categorías" ]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSubTab(key)}
                className={`px-6 py-3 text-[11px] font-black tracking-[2px] uppercase rounded-t-2xl transition-all duration-300 ${
                  subTab === key
                    ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20 translate-y-0.5"
                    : "bg-surface-2 dark:bg-surface-dark-2 text-content-subtle hover:bg-surface-3 hover:text-content dark:hover:text-content-dark opacity-70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {lowStock.length > 0 && subTab === "productos" && (
          <div className="flex items-center gap-4 bg-danger/10 border border-danger/20 p-4 rounded-3xl animate-pulse shadow-sm">
            <div className="w-10 h-10 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center text-xl shadow-sm border border-white/20"></div>
            <div>
              <div className="text-[10px] font-black text-danger uppercase tracking-widest">Alerta de Stock</div>
              <div className="text-xs font-bold text-content/80 dark:text-content-dark/80">
                <span className="text-danger">{lowStock.length}</span> productos agotándose
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── PRODUCTOS ── */}
      {subTab === "productos" && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
            <div className="relative flex-1 group w-full max-w-2xl">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, código o categoría..."
                className="input !pl-14 !h-16 !text-base !rounded-[24px] shadow-sm border border-border/60"
              />
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-content-subtle group-focus-within:text-brand-500 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="flex-1 lg:w-72 bg-surface-2 dark:bg-white/5 border border-border/40 rounded-[24px] px-6 py-2 group-focus-within:border-brand-500 transition-all flex items-center h-16 shadow-sm relative">
                <div className="flex flex-col flex-1 pl-1">
                  <label className="text-[9px] font-black uppercase tracking-[3px] text-brand-500 opacity-80 mb-0.5">Visión de Existencias</label>
                  <div className="relative">
                    <select 
                      value={selectedWarehouseId} 
                      onChange={e => setSelectedWarehouseId(e.target.value)}
                      className="w-full bg-transparent border-none outline-none text-[11px] font-black uppercase text-content dark:text-white p-0 appearance-none cursor-pointer pr-8"
                    >
                      <option value="" className="dark:bg-[#111] dark:text-white">Inventario Global (Total)</option>
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id} className="dark:bg-[#111] dark:text-white">Almacén: {w.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-brand-500">
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {canManageProducts && (
              <button 
                onClick={openNewProduct} 
                className="btn-primary !h-16 px-10 !rounded-[24px] shadow-xl shadow-brand-500/20 flex items-center gap-3 w-full lg:w-auto justify-center group"
              >
                <span className="text-3xl opacity-20"></span>
                <span className="text-[11px] font-black tracking-[2px] uppercase">Nuevo Producto</span>
              </button>
            )}
          </div>

          <div className="card-premium !p-0 overflow-hidden">
            <DataTable 
              columns={[
                { 
                  key: 'img', 
                  label: '', 
                  render: p => p.image_url 
                    ? <img src={p.image_url} alt="" className="w-12 h-12 rounded-2xl object-cover shadow-md border border-white/20" /> 
                    : <div className="w-12 h-12 rounded-2xl bg-surface-3 dark:bg-surface-dark-3 border border-border/40 flex items-center justify-center text-xs font-black text-content-subtle opacity-50">{p.name.charAt(0)}</div>, 
                  cellClassName: "w-20 pl-8" 
                },
                { 
                  key: 'name', 
                  label: 'Identificación de Producto', 
                  render: p => (
                    <div className="flex flex-col">
                      <span className="font-black text-sm text-content dark:text-white">{p.name}</span>
                      <span className="text-[9px] font-black tracking-[2px] uppercase text-content-subtle/70 dark:text-content-dark-muted mt-1 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500/40" />
                        {p.category_name || "Sin Categoría"}
                      </span>
                    </div>
                  ) 
                },
                { 
                  key: 'stock', 
                  label: selectedWarehouseId ? 'Disp. en Almacén' : 'Disp. Global', 
                  render: p => {
                    const localStock = parseFloat(p.warehouse_stock ?? p.stock);
                    const globalStock = parseFloat(p.stock);
                    const hasLocal = selectedWarehouseId !== "";
                    
                    return (
                      <div className={`flex flex-col gap-1 ${stockColorClass(localStock)}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black tracking-tight">{localStock}</span>
                          <span className="text-[10px] uppercase font-black opacity-60 tracking-widest">{p.unit || "uds"}</span>
                          {hasLocal && globalStock !== localStock && (
                             <span className="px-1.5 py-0.5 rounded bg-surface-3 dark:bg-white/10 text-[8px] font-black uppercase text-content-subtle border border-border/20">
                               Global: {globalStock}
                             </span>
                          )}
                        </div>
                        <div className="w-full max-w-[80px] h-1.5 bg-surface-2 dark:bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-1000 ${stockBarClass(localStock)}`} 
                            style={{ width: `${Math.min((localStock/50)*100, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  } 
                },
                { 
                  key: 'price', 
                  label: 'Valor Unitario', 
                  render: p => (
                    <div className="flex flex-col">
                      <span className="font-black text-base text-brand-500 dark:text-brand-400">{fmtPrice(p.price)}</span>
                      <span className="text-[9px] font-bold text-content-subtle uppercase tracking-widest">Precio Final</span>
                    </div>
                  ) 
                },
                { 
                  key: 'actions', 
                  label: 'Gestión', 
                  render: p => (
                    <div className="flex gap-2">
                      {canManageProducts && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); openEditProduct(p); }} className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20 hover:bg-orange-500 hover:text-white transition-all active:scale-90 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); deleteProduct(p.id); }} className="w-10 h-10 rounded-xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all active:scale-90 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </>
                      )}
                    </div>
                  ),
                  headerClassName: "pr-8",
                  cellClassName: "pr-8"
                }
              ]}
              data={products}
              emptyMessage="No se encontraron productos en el inventario"
              emptyIcon=""
              pagination={{
                page,
                limit: LIMIT,
                total: totalProducts,
                onPageChange: setPage
              }}
            />
          </div>
        </div>
      )}

      {/* ── CATEGORÍAS ── */}
      {subTab === "categorias" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in slide-in-from-bottom-4 duration-500">
          
          {/* Left: Lista de categorías */}
          <div className="lg:col-span-12">
            <div className="card-premium !p-0 overflow-hidden">
              <div className="p-8 border-b border-border/40">
                 <h3 className="text-xl font-black tracking-tight text-content dark:text-content-dark uppercase font-display">
                  Listado de <span className="text-brand-500">Categorías</span>
                </h3>
              </div>
              <DataTable 
                columns={[
                  { 
                    key: 'name', 
                    label: 'Nombre de Categoría', 
                    render: cat => (
                      <div className="py-2">
                        {catEditId === cat.id ? (
                          <div className="flex gap-3 items-center group">
                            <input
                              value={catEditName}
                              onChange={e => setCatEditName(e.target.value)}
                              autoFocus
                              className="input flex-1 !h-12 !rounded-xl !text-sm border-brand-500/50"
                              placeholder="Editar nombre..."
                            />
                            <button onClick={updateCategory} className="w-12 h-12 rounded-xl bg-success text-black shadow-lg shadow-success/20 active:scale-90 transition-all flex items-center justify-center">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </button>
                            <button onClick={() => { setCatEditId(null); setCatEditName(""); }} className="w-12 h-12 rounded-xl bg-surface-3 dark:bg-white/10 text-content active:scale-90 transition-all flex items-center justify-center">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        ) : (
                          <span className="font-black text-sm text-content dark:text-content-dark">{cat.name}</span>
                        )}
                      </div>
                    )
                  },
                  { 
                    key: 'count', 
                    label: 'Productos Vinculados', 
                    render: cat => (
                      <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-brand-500/10 text-brand-500 text-[10px] font-black uppercase tracking-widest border border-brand-500/10">
                        {products.filter(p => p.category_id === cat.id).length} Artículos
                      </span>
                    )
                  },
                  { 
                    key: 'actions', 
                    label: 'Acciones', 
                    render: cat => canManageCategories && catEditId !== cat.id && (
                      <div className="flex gap-2">
                        <button onClick={() => { setCatEditId(cat.id); setCatEditName(cat.name); }} className="px-6 py-2.5 rounded-xl bg-surface-2 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-white transition-all active:scale-95 border border-border/40">
                          Renombrar
                        </button>
                        <button onClick={() => deleteCategory(cat.id)} className="px-6 py-2.5 rounded-xl bg-danger/10 text-danger text-[10px] font-black uppercase tracking-widest hover:bg-danger hover:text-white transition-all active:scale-95 border border-danger/20">
                          Eliminar
                        </button>
                      </div>
                    ),
                    headerClassName: "pr-8",
                    cellClassName: "pr-8"
                  }
                ]}
                data={categories}
              />
            </div>
          </div>

          {/* New Category Float Card? Or just below? Let's use a nice card for creating */}
          {canManageCategories && (
            <div className="lg:col-span-12">
            <div className="card-premium p-8 !bg-brand-500/5 border-dashed border-2 border-brand-500/30">
              <div className="flex flex-col md:flex-row gap-8 items-end">
                <div className="flex-1 space-y-3">
                  <h4 className="text-[10px] font-black text-brand-600 dark:text-brand-400 uppercase tracking-[4px]">Nueva Categoría</h4>
                  <div className="relative group">
                    <input
                      value={catName}
                      onChange={e => setCatName(e.target.value)}
                      placeholder="Ejemplo: Bebidas, Lácteos, Cigarrillos..."
                      onKeyDown={e => e.key === "Enter" && createCategory()}
                      className="input !h-16 !pl-14 !bg-white dark:!bg-surface-dark-2 !rounded-2xl border-brand-500/20 group-focus-within:border-brand-500 transition-all font-bold"
                    />
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-500/40 group-focus-within:text-brand-500 transition-colors pointer-events-none">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                    </div>
                  </div>
                </div>
                <button onClick={createCategory} className="btn-primary !h-16 px-12 !rounded-2xl shadow-xl shadow-brand-500/20 w-full md:w-auto font-black text-[11px] uppercase tracking-[3px]">
                  Vincular Categoría
                </button>
              </div>
            </div>
            </div>
          )}

        </div>
      )}

      {/* Modals */}
      <ProductModal
        open={productModal}
        onClose={closeModal}
        onSave={saveProduct}
        editData={productEditData}
        categories={categories}
        loading={loading}
      />

      <ConfirmModal
        isOpen={!!deleteProductDialog}
        title="¿Eliminar Producto?"
        message="Esta acción no se puede deshacer. Se perderá el registro del stock y el historial si no hay ventas asociadas."
        onConfirm={confirmDeleteProduct}
        onCancel={() => setDeleteProductDialog(null)}
        type="danger"
        confirmText="Confirmar Eliminación"
      />

      <ConfirmModal
        isOpen={!!deleteCategoryDialog}
        title="¿Eliminar Categoría?"
        message="¿Estás seguro? Los productos pertenecientes a esta categoría quedarán como 'Sin Categoría'."
        onConfirm={confirmDeleteCategory}
        onCancel={() => setDeleteCategoryDialog(null)}
        type="danger"
        confirmText="Eliminar de por vida"
      />
    </div>
  );
}
