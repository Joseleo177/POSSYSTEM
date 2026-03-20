import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import ProductModal from "../components/ProductModal";

export default function CatalogPage() {
  const { notify, baseCurrency, categories, loadCategories } = useApp();

  const [subTab, setSubTab]     = useState("productos"); // productos | categorias
  const [products, setProducts] = useState([]);
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

  const fmtPrice = (n) => `${baseCurrency?.symbol || "$"}${Number(n).toFixed(2)}`;

  // ── Loaders ────────────────────────────────────────────────
  const loadProducts = async (q = "") => {
    try { const r = await api.products.getAll(q ? { search: q } : {}); setProducts(r.data); }
    catch (e) { notify(e.message, "err"); }
  };

  useEffect(() => { loadProducts(); }, []);
  useEffect(() => { loadProducts(search); }, [search]);

  // ── Product CRUD ───────────────────────────────────────────
  const openNewProduct  = () => { setProductEditData(null); setEditId(null); setProductModal(true); };
  const openEditProduct = (p) => { setEditId(p.id); setProductEditData(p); setProductModal(true); };
  const closeModal      = () => { setProductModal(false); setProductEditData(null); setEditId(null); };

  const saveProduct = async (form, imageFile) => {
    const { name, price, stock, category_id, unit, qty_step } = form;
    if (!name || !price) return notify("Nombre y precio son requeridos", "err");
    setLoading(true);
    try {
      const payload = {
        name, price: +price, stock: +stock,
        category_id: category_id || null,
        unit: unit || "unidad",
        qty_step: +qty_step || 1,
      };
      if (editId !== null) { await api.products.update(editId, payload, imageFile); notify("Producto actualizado ✓"); }
      else                 { await api.products.create(payload, imageFile);          notify("Producto agregado ✓"); }
      closeModal(); loadProducts(search);
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  };

  const deleteProduct = async (id) => {
    if (!confirm("¿Eliminar producto?")) return;
    try { await api.products.remove(id); notify("Producto eliminado"); loadProducts(search); }
    catch (e) { notify(e.message, "err"); }
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

  const deleteCategory = async (id) => {
    if (!confirm("¿Eliminar esta categoría?")) return;
    try { await api.categories.remove(id); notify("Categoría eliminada"); loadCategories(); }
    catch (e) { notify(e.message, "err"); }
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
        <div>
          {lowStock.length > 0 && (
            <div className="flex gap-3 items-start bg-danger/10 border border-danger rounded-md px-[18px] py-3 mb-5">
              <span className="text-danger text-lg leading-none mt-0.5">⚠</span>
              <div>
                <div className="font-bold text-danger text-[13px] tracking-wide">STOCK BAJO (≤5 unidades)</div>
                <div className="text-xs text-content-muted dark:text-content-dark-muted mt-0.5">
                  {lowStock.map(p => p.name).join(", ")}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 flex-1">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Buscar producto..."
                className="input flex-1"
              />
              <div className="text-[11px] text-content-muted dark:text-content-dark-muted whitespace-nowrap">
                {products.length} producto{products.length !== 1 ? "s" : ""}
              </div>
            </div>
            <button onClick={openNewProduct} className="btn-md btn-primary whitespace-nowrap">
              + Nuevo producto
            </button>
          </div>

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
            {products.map(p => (
              <div
                key={p.id}
                onClick={() => openEditProduct(p)}
                className="card cursor-pointer border border-border dark:border-border-dark hover:border-brand-400 transition-colors duration-150 p-3.5"
              >
                <div className="flex justify-between items-start mb-1.5">
                  <div>
                    <div className="text-[10px] text-content-muted dark:text-content-dark-muted mb-0.5">
                      {p.category_name || "General"}
                    </div>
                    <div className="font-bold text-[13px] text-content dark:text-content-dark">{p.name}</div>
                  </div>
                  {p.image_url && (
                    <div className="w-9 h-9 rounded overflow-hidden bg-surface-2 dark:bg-surface-dark shrink-0 ml-1.5">
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                {/* Stock bar — width is dynamic so inline style is required here */}
                <div className="h-1 bg-surface-2 dark:bg-surface-dark rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full ${stockBarClass(p.stock)}`}
                    style={{ width: Math.min(100, (parseFloat(p.stock) / 100) * 100) + "%" }}
                  />
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className={stockColorClass(p.stock)}>
                    Stock: <b>{p.stock}</b>{" "}
                    <span className="text-content-muted dark:text-content-dark-muted text-[10px]">
                      {p.unit || "unidad"}
                    </span>
                  </span>
                  <span className="text-brand-500 font-bold">{fmtPrice(p.price)}</span>
                </div>

                <div className="flex gap-1.5 mt-2.5">
                  <button
                    onClick={e => { e.stopPropagation(); openEditProduct(p); }}
                    className="btn-sm btn-secondary flex-1 text-center"
                  >
                    Editar
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteProduct(p.id); }}
                    className="btn-sm btn-danger flex-1 text-center"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
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
    </div>
  );
}
