import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import ProductModal from "../components/ProductModal";
import DataTable from "../components/DataTable";

export default function CatalogPage() {
  const { notify, baseCurrency, categories, loadCategories } = useApp();

  const [subTab, setSubTab]     = useState("productos"); // productos | categorias
  const [products, setProducts] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 50;
  
  const [search, setSearch]     = useState("");
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

  const fmtPrice = (n) => `${baseCurrency?.symbol || "$"}${Number(n).toFixed(2)}`;

  // ── Loaders ────────────────────────────────────────────────
  useEffect(() => { setPage(1); }, [search]);
  
  const loadProducts = async () => {
    try { 
      const q = { limit: LIMIT, offset: (page - 1) * LIMIT };
      if (search) q.search = search;
      const r = await api.products.getAll(q); 
      setProducts(r.data); 
      setTotalProducts(r.total || r.data.length);
    }
    catch (e) { notify(e.message, "err"); }
  };

  useEffect(() => { loadProducts(); }, [page, search]);

  // ── Product CRUD ───────────────────────────────────────────
  const openNewProduct  = () => { setProductEditData(null); setEditId(null); setProductModal(true); };
  const openEditProduct = (p) => { setEditId(p.id); setProductEditData(p); setProductModal(true); };
  const closeModal      = () => { setProductModal(false); setProductEditData(null); setEditId(null); };

  const saveProduct = async (form, imageFile) => {
    const { name, price, stock, category_id, unit, qty_step, is_combo, combo_items, is_service } = form;
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
      };
      if (editId !== null) { await api.products.update(editId, payload, imageFile); notify("Producto actualizado ✓"); }
      else                 { await api.products.create(payload, imageFile);          notify("Producto agregado ✓"); }
      closeModal(); loadProducts(search);
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  };

  const deleteProduct = (id) => {
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
    if (!catName.trim()) return notify("Nombre requerido", "err");
    try { await api.categories.create({ name: catName.trim() }); notify("Categoría creada ✓"); setCatName(""); loadCategories(); }
    catch (e) { notify(e.message, "err"); }
  };

  const updateCategory = async () => {
    if (!catEditName.trim()) return notify("Nombre requerido", "err");
    try { await api.categories.update(catEditId, { name: catEditName.trim() }); notify("Categoría actualizada ✓"); setCatEditId(null); setCatEditName(""); loadCategories(); }
    catch (e) { notify(e.message, "err"); }
  };

  const deleteCategory = (id) => {
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
    <div>
      {/* Sub-tabs */}
      <div className="flex border-b border-border dark:border-border-dark mb-5">
        {[["productos","PRODUCTOS"],["categorias","CATEGORÍAS"]].map(([key,label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={[
              "px-[18px] py-2 text-xs font-semibold tracking-widest border-b-2 -mb-px cursor-pointer bg-transparent transition-colors",
              subTab === key
                ? "border-brand-500 text-brand-500"
                : "border-transparent text-content-muted dark:text-content-dark-muted hover:text-content dark:hover:text-content-dark",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── PRODUCTOS ── */}
      {subTab === "productos" && (
        <div className="animate-in fade-in">
          <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
            <div className="relative flex-1 group min-w-[280px]">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Buscar por nombre, categoría o ID..."
                className="input-pos w-full pl-12 pr-4 py-3 bg-white dark:bg-surface-dark-2 rounded-xl border border-border dark:border-border-dark focus:ring-2 focus:ring-brand-500/20 transition-all shadow-sm"
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-content-subtle group-focus-within:text-brand-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>
            </div>
            <button onClick={openNewProduct} className="px-8 py-3 rounded-xl text-white font-black text-xs uppercase tracking-[2px] bg-brand-500 hover:bg-brand-600 shadow-lg shadow-brand-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap">
              + Nuevo Producto
            </button>
          </div>

          <DataTable 
            columns={[
              { key: 'img', label: '', render: p => p.image_url ? <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shadow-sm" /> : <div className="w-10 h-10 rounded-lg bg-surface-3 dark:bg-surface-dark-3 border border-border/50 flex items-center justify-center text-[10px] uppercase font-bold text-content-subtle">{p.name.charAt(0)}</div>, cellClassName: "w-16" },
              { key: 'name', label: 'Producto', render: p => <div><div className="font-bold text-xs text-content dark:text-content-dark">{p.name}</div><div className="text-[10px] text-content-muted dark:text-content-dark-muted font-bold tracking-widest uppercase mt-0.5">{p.category_name || "General"}</div></div> },
              { key: 'stock', label: 'Stock Disp.', render: p => <span className={`flex items-center gap-1.5 ${stockColorClass(p.stock)}`}><span className={`w-2 h-2 rounded-full ${stockBarClass(p.stock)}`} /> <b className="text-sm">{p.stock}</b> <span className="text-[9px] uppercase tracking-widest opacity-70">{p.unit || "ud."}</span></span> },
              { key: 'price', label: 'Precio Total', render: p => <span className="font-black text-brand-500 dark:text-brand-400">{fmtPrice(p.price)}</span> },
              { key: 'actions', label: 'Acciones', render: p => (
                  <div className="flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); openEditProduct(p); }} className="p-2 rounded-lg bg-warning/10 text-warning border border-warning/20 hover:bg-warning hover:text-white transition-all shadow-sm" title="Editar"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteProduct(p.id); }} className="p-2 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all shadow-sm" title="Eliminar"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                  </div>
              )}
            ]}
            data={products}
            emptyMessage="No hay productos registrados"
            emptyIcon="📦"
            pagination={{
              page,
              limit: LIMIT,
              total: totalProducts,
              onPageChange: setPage
            }}
          />
        </div>
      )}

      {/* ── CATEGORÍAS ── */}
      {subTab === "categorias" && (
        <div className="max-w-[560px]">
          <div className="card p-[18px] mb-5">
            <div className="font-bold text-[13px] text-brand-500 tracking-widest mb-3.5">CATEGORÍAS</div>
            <table className="table-pos w-full">
              <thead>
                <tr>
                  {["Nombre", "Productos", "Acciones"].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[11px] tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, i) => (
                  <tr key={cat.id} className={i % 2 === 0 ? "bg-surface-2 dark:bg-surface-dark" : ""}>
                    <td className="px-3 py-2.5 font-bold text-content dark:text-content-dark">
                      {catEditId === cat.id
                        ? (
                          <input
                            value={catEditName}
                            onChange={e => setCatEditName(e.target.value)}
                            autoFocus
                            className="input-sm w-full"
                          />
                        )
                        : cat.name}
                    </td>
                    <td className="px-3 py-2.5 text-content-muted dark:text-content-dark-muted">
                      {products.filter(p => p.category_id === cat.id).length}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5">
                        {catEditId === cat.id ? (
                          <>
                            <button onClick={updateCategory} className="btn-sm btn-primary">
                              ✓ Guardar
                            </button>
                            <button
                              onClick={() => { setCatEditId(null); setCatEditName(""); }}
                              className="btn-sm btn-ghost"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setCatEditId(cat.id); setCatEditName(cat.name); }}
                              className="btn-sm btn-secondary"
                            >
                              Renombrar
                            </button>
                            <button
                              onClick={() => deleteCategory(cat.id)}
                              className="btn-sm btn-danger"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-[18px]">
            <div className="font-bold text-[13px] text-brand-500 tracking-widest mb-3">+ NUEVA CATEGORÍA</div>
            <div className="flex gap-2.5 items-end">
              <div className="flex-1">
                <label className="label">Nombre *</label>
                <input
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  placeholder="ej. Lácteos"
                  onKeyDown={e => e.key === "Enter" && createCategory()}
                  className="input w-full mt-1"
                />
              </div>
              <button onClick={createCategory} className="btn-md btn-primary">
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      <ProductModal
        open={productModal}
        onClose={closeModal}
        onSave={saveProduct}
        editData={productEditData}
        categories={categories}
        loading={loading}
      />

      {/* ── ALERTA: Eliminar Producto ── */}
      {deleteProductDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-5">
          <div className="bg-surface-2 dark:bg-surface-dark-2 border border-danger/60 rounded-xl p-6 w-full max-w-[340px]">
             <div className="text-danger flex justify-center mb-3">
               <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
             </div>
             <div className="font-bold text-center text-sm mb-1.5 text-content dark:text-content-dark">¿Desactivar este producto?</div>
             <div className="text-center text-[12px] text-content-muted dark:text-content-dark-muted mb-5 leading-relaxed">
               Estás a punto de desvincular o eliminar este producto del sistema de manera permanente.
             </div>
             <div className="flex gap-2.5 justify-center">
                <button onClick={confirmDeleteProduct} className="btn-md btn-danger">Sí, eliminar</button>
                <button onClick={() => setDeleteProductDialog(null)} className="btn-md btn-secondary shadow-sm bg-white dark:bg-surface-dark-3 border border-border dark:border-border-dark text-content dark:text-content-dark hover:bg-surface-2 dark:hover:bg-surface-dark font-bold text-xs uppercase tracking-widest transition-all">Cancelar</button>
             </div>
          </div>
        </div>
      )}

      {/* ── ALERTA: Eliminar Categoría ── */}
      {deleteCategoryDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-5">
          <div className="bg-surface-2 dark:bg-surface-dark-2 border border-danger/60 rounded-xl p-6 w-full max-w-[340px]">
             <div className="text-danger flex justify-center mb-3">
               <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
             </div>
             <div className="font-bold text-center text-sm mb-1.5 text-content dark:text-content-dark">¿Estás seguro?</div>
             <div className="text-center text-[12px] text-content-muted dark:text-content-dark-muted mb-5 leading-relaxed">
               Eliminar esta categoría afectará a todos los productos que la utilicen actualmente.
             </div>
             <div className="flex gap-2.5 justify-center">
                <button onClick={confirmDeleteCategory} className="btn-md btn-danger">Sí, eliminar</button>
                <button onClick={() => setDeleteCategoryDialog(null)} className="btn-md btn-secondary shadow-sm bg-white dark:bg-surface-dark-3 border border-border dark:border-border-dark text-content dark:text-content-dark hover:bg-surface-2 dark:hover:bg-surface-dark font-bold text-xs uppercase tracking-widest transition-all">Cancelar</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
