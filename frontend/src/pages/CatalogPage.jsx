import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import ProductModal from "../components/ProductModal";

const btnSmall = {
  background: "transparent", color: "#888", border: "1px solid #333",
  padding: "3px 8px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 11,
};

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

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display:"flex",gap:0,marginBottom:20,borderBottom:"2px solid #1e1e1e" }}>
        {[["productos","PRODUCTOS"],["categorias","CATEGORÍAS"]].map(([key,label]) => (
          <button key={key} onClick={() => setSubTab(key)}
            style={{ background:"transparent",color:subTab===key?"#f0a500":"#555",border:"none",borderBottom:subTab===key?"2px solid #f0a500":"2px solid transparent",padding:"8px 18px",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:subTab===key?"bold":"normal",letterSpacing:1,marginBottom:-2 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── PRODUCTOS ── */}
      {subTab === "productos" && (
        <div>
          {lowStock.length > 0 && (
            <div style={{ background:"#2b1111",border:"1px solid #e74c3c",borderRadius:6,padding:"12px 18px",marginBottom:20,display:"flex",gap:12 }}>
              <span style={{ color:"#e74c3c",fontSize:18 }}>⚠</span>
              <div>
                <div style={{ fontWeight:"bold",color:"#e74c3c",fontSize:13 }}>STOCK BAJO (≤5 unidades)</div>
                <div style={{ fontSize:12,color:"#aaa" }}>{lowStock.map(p => p.name).join(", ")}</div>
              </div>
            </div>
          )}

          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,gap:12,flexWrap:"wrap" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10,flex:1 }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Buscar producto..."
                style={{ flex:1,background:"#1a1a1a",border:"1px solid #333",color:"#e8e0d0",padding:"8px 12px",borderRadius:4,fontFamily:"inherit",fontSize:13,boxSizing:"border-box" }} />
              <div style={{ fontSize:11,color:"#555",whiteSpace:"nowrap" }}>{products.length} producto{products.length!==1?"s":""}</div>
            </div>
            <button onClick={openNewProduct}
              style={{ background:"#f0a500",color:"#0f0f0f",border:"none",padding:"8px 20px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:13,whiteSpace:"nowrap" }}>
              + Nuevo producto
            </button>
          </div>

          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12 }}>
            {products.map(p => {
              const stockColor = parseFloat(p.stock)<=5?"#e74c3c":parseFloat(p.stock)<=20?"#f0a500":"#27ae60";
              return (
                <div key={p.id} onClick={() => openEditProduct(p)}
                  style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:14,cursor:"pointer",transition:"border-color .15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor="#f0a500"}
                  onMouseLeave={e => e.currentTarget.style.borderColor="#2a2a2a"}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6 }}>
                    <div>
                      <div style={{ fontSize:10,color:"#555",marginBottom:2 }}>{p.category_name||"General"}</div>
                      <div style={{ fontWeight:"bold",fontSize:13 }}>{p.name}</div>
                    </div>
                    {p.image_url && (
                      <div style={{ width:36,height:36,borderRadius:4,overflow:"hidden",background:"#111",flexShrink:0,marginLeft:6 }}>
                        <img src={p.image_url} alt={p.name} style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                      </div>
                    )}
                  </div>
                  <div style={{ height:4,background:"#111",borderRadius:3,overflow:"hidden",marginBottom:8 }}>
                    <div style={{ height:"100%",width:Math.min(100,(parseFloat(p.stock)/100)*100)+"%",background:stockColor,borderRadius:3 }} />
                  </div>
                  <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,alignItems:"center" }}>
                    <span style={{ color:stockColor }}>Stock: <b>{p.stock}</b> <span style={{ color:"#555",fontSize:10 }}>{p.unit||"unidad"}</span></span>
                    <span style={{ color:"#f0a500",fontWeight:"bold" }}>{fmtPrice(p.price)}</span>
                  </div>
                  <div style={{ display:"flex",gap:6,marginTop:10 }}>
                    <button onClick={e => { e.stopPropagation(); openEditProduct(p); }}
                      style={{ ...btnSmall,flex:1,color:"#f0a500",borderColor:"#f0a500",textAlign:"center" }}>Editar</button>
                    <button onClick={e => { e.stopPropagation(); deleteProduct(p.id); }}
                      style={{ ...btnSmall,flex:1,color:"#e74c3c",borderColor:"#e74c3c",textAlign:"center" }}>Eliminar</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CATEGORÍAS ── */}
      {subTab === "categorias" && (
        <div style={{ maxWidth:560 }}>
          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18,marginBottom:20 }}>
            <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:14 }}>CATEGORÍAS</div>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:"2px solid #f0a500",color:"#f0a500" }}>
                  {["Nombre","Productos","Acciones"].map(h =>
                    <th key={h} style={{ textAlign:"left",padding:"8px 12px",fontSize:11,letterSpacing:1 }}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat,i) => (
                  <tr key={cat.id} style={{ background:i%2===0?"#111":"transparent",borderBottom:"1px solid #1e1e1e" }}>
                    <td style={{ padding:"10px 12px",fontWeight:"bold" }}>
                      {catEditId===cat.id
                        ? <input value={catEditName} onChange={e => setCatEditName(e.target.value)} autoFocus
                            style={{ background:"#0f0f0f",border:"1px solid #f0a500",color:"#e8e0d0",padding:"4px 8px",borderRadius:3,fontFamily:"inherit",fontSize:12,width:"100%" }} />
                        : cat.name}
                    </td>
                    <td style={{ padding:"10px 12px",color:"#888" }}>
                      {products.filter(p => p.category_id === cat.id).length}
                    </td>
                    <td style={{ padding:"10px 12px" }}>
                      <div style={{ display:"flex",gap:6 }}>
                        {catEditId===cat.id ? (
                          <>
                            <button onClick={updateCategory} style={{ ...btnSmall,color:"#27ae60",borderColor:"#27ae60" }}>✓ Guardar</button>
                            <button onClick={() => { setCatEditId(null); setCatEditName(""); }} style={btnSmall}>✕</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setCatEditId(cat.id); setCatEditName(cat.name); }}
                              style={{ ...btnSmall,color:"#f0a500",borderColor:"#f0a500" }}>Renombrar</button>
                            <button onClick={() => deleteCategory(cat.id)}
                              style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>Eliminar</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18 }}>
            <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:12 }}>+ NUEVA CATEGORÍA</div>
            <div style={{ display:"flex",gap:10,alignItems:"flex-end" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Nombre *</div>
                <input value={catName} onChange={e => setCatName(e.target.value)}
                  placeholder="ej. Lácteos"
                  onKeyDown={e => e.key==="Enter" && createCategory()}
                  style={{ width:"100%",background:"#0f0f0f",border:"1px solid #333",color:"#e8e0d0",padding:"8px 10px",borderRadius:4,fontFamily:"inherit",fontSize:13,boxSizing:"border-box" }} />
              </div>
              <button onClick={createCategory}
                style={{ background:"#f0a500",color:"#0f0f0f",border:"none",padding:"8px 20px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:13 }}>
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