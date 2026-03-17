import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";

const btnSmall = {
  background: "transparent", color: "#888", border: "1px solid #333",
  padding: "3px 8px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 11,
};

const EMPTY_WAREHOUSE = { name: "", description: "", sort_order: 0 };
const EMPTY_ADD_STOCK = { product_id: "", qty: "" };

export default function WarehousesTab({ notify, currentEmployee }) {
  const [subTab, setSubTab] = useState("almacenes");

  // ── Almacenes ──────────────────────────────────────────────
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm]             = useState(EMPTY_WAREHOUSE);
  const [editId, setEditId]         = useState(null);
  const [loading, setLoading]       = useState(false);

  // ── Stock ──────────────────────────────────────────────────
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [stock, setStock]               = useState([]);
  const [stockSearch, setStockSearch]   = useState("");
  const [loadingStock, setLoadingStock] = useState(false);

  // ── Agregar producto al almacén manualmente ────────────────
  const [addStockModal, setAddStockModal]   = useState(false);
  const [addStockForm, setAddStockForm]     = useState(EMPTY_ADD_STOCK);
  const [addStockSearch, setAddStockSearch] = useState("");
  const [addStockResults, setAddStockResults] = useState([]);
  const [addStockProduct, setAddStockProduct] = useState(null);
  const [savingStock, setSavingStock]       = useState(false);

  // ── Transferencias ─────────────────────────────────────────
  const [transfers, setTransfers]     = useState([]);
  const [products, setProducts]       = useState([]);
  const [transferForm, setTransferForm] = useState({
    from_warehouse_id: "", to_warehouse_id: "", product_id: "", qty: "", note: "",
  });
  const [loadingTransfer, setLoadingTransfer] = useState(false);

  // ── Empleados ──────────────────────────────────────────────
  const [employees, setEmployees]           = useState([]);
  const [assignModal, setAssignModal]       = useState(null);
  const [assignSelected, setAssignSelected] = useState([]);

  // ── Loaders ────────────────────────────────────────────────
  const loadWarehouses = useCallback(async () => {
    try { const r = await api.warehouses.getAll(); setWarehouses(r.data); }
    catch (e) { notify(e.message, "err"); }
  }, []);

  const loadStock = useCallback(async (warehouseId) => {
    setLoadingStock(true);
    try { const r = await api.warehouses.getStock(warehouseId); setStock(r.data); }
    catch (e) { notify(e.message, "err"); }
    finally { setLoadingStock(false); }
  }, []);

  const loadTransfers = useCallback(async () => {
    try { const r = await api.warehouses.getTransfers({ limit: 100 }); setTransfers(r.data); }
    catch (e) { notify(e.message, "err"); }
  }, []);

  const loadProducts = useCallback(async () => {
    try { const r = await api.products.getAll(); setProducts(r.data); }
    catch (e) {}
  }, []);

  const loadEmployees = useCallback(async () => {
    try { const r = await api.employees.getAll(); setEmployees(r.data); }
    catch (e) {}
  }, []);

  useEffect(() => { loadWarehouses(); loadProducts(); loadEmployees(); }, []);
  useEffect(() => { if (subTab === "transferencias") loadTransfers(); }, [subTab]);
  useEffect(() => {
    if (subTab === "stock" && selectedWarehouse) loadStock(selectedWarehouse.id);
  }, [subTab, selectedWarehouse]);

  // ── Búsqueda de producto para modal addStock ───────────────
  useEffect(() => {
    if (!addStockSearch.trim()) { setAddStockResults([]); return; }
    const t = setTimeout(async () => {
      try { const r = await api.products.getAll({ search: addStockSearch }); setAddStockResults(r.data.slice(0, 8)); }
      catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [addStockSearch]);

  // ── CRUD almacenes ─────────────────────────────────────────
  const saveWarehouse = async () => {
    if (!form.name.trim()) return notify("El nombre es requerido", "err");
    setLoading(true);
    try {
      if (editId) { await api.warehouses.update(editId, form); notify("Almacén actualizado ✓"); }
      else        { await api.warehouses.create(form);         notify("Almacén creado ✓"); }
      setForm(EMPTY_WAREHOUSE); setEditId(null);
      await loadWarehouses();
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  };

  const deleteWarehouse = async (id) => {
    if (!confirm("¿Eliminar este almacén? Solo es posible si no tiene stock.")) return;
    try { await api.warehouses.remove(id); notify("Almacén eliminado"); await loadWarehouses(); }
    catch (e) { notify(e.message, "err"); }
  };

  const startEdit  = (w) => { setEditId(w.id); setForm({ name: w.name, description: w.description || "", sort_order: w.sort_order }); };
  const cancelEdit = ()  => { setEditId(null); setForm(EMPTY_WAREHOUSE); };

  // ── Agregar producto manualmente ───────────────────────────
  const openAddStock = () => {
    setAddStockProduct(null);
    setAddStockForm(EMPTY_ADD_STOCK);
    setAddStockSearch("");
    setAddStockResults([]);
    setAddStockModal(true);
  };

  const selectAddStockProduct = (p) => {
    setAddStockProduct(p);
    setAddStockSearch("");
    setAddStockResults([]);
    setAddStockForm(prev => ({ ...prev, product_id: p.id }));
  };

  const doAddStock = async () => {
    if (!addStockProduct)              return notify("Selecciona un producto", "err");
    if (!addStockForm.qty && addStockForm.qty !== 0) return notify("Ingresa la cantidad", "err");
    setSavingStock(true);
    try {
      await api.warehouses.addStock(selectedWarehouse.id, {
        product_id: addStockProduct.id,
        qty:        parseFloat(addStockForm.qty) || 0,
      });
      notify(`${addStockProduct.name} agregado al almacén ✓`);
      setAddStockModal(false);
      await loadStock(selectedWarehouse.id);
      await loadWarehouses();
    } catch (e) { notify(e.message, "err"); }
    finally { setSavingStock(false); }
  };

  // ── Transferencias ─────────────────────────────────────────
  const doTransfer = async () => {
    const { from_warehouse_id, to_warehouse_id, product_id, qty, note } = transferForm;
    if (!to_warehouse_id || !product_id || !qty)
      return notify("Destino, producto y cantidad son requeridos", "err");
    setLoadingTransfer(true);
    try {
      await api.warehouses.transfer({
        from_warehouse_id: from_warehouse_id || null,
        to_warehouse_id:   parseInt(to_warehouse_id),
        product_id:        parseInt(product_id),
        qty:               parseFloat(qty),
        note:              note || null,
      });
      notify("Transferencia registrada ✓");
      setTransferForm({ from_warehouse_id: "", to_warehouse_id: "", product_id: "", qty: "", note: "" });
      await loadTransfers(); await loadWarehouses();
    } catch (e) { notify(e.message, "err"); }
    finally { setLoadingTransfer(false); }
  };

  // ── Asignar empleados ──────────────────────────────────────
  const openAssign   = (w) => { setAssignModal(w); setAssignSelected((w.assigned_employees || []).map(e => e.employee_id)); };
  const saveAssign   = async () => {
    try { await api.warehouses.assignEmployees(assignModal.id, { employee_ids: assignSelected }); notify("Empleados asignados ✓"); setAssignModal(null); await loadWarehouses(); }
    catch (e) { notify(e.message, "err"); }
  };
  const toggleAssign = (empId) => setAssignSelected(prev => prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]);

  // ── Stock filtrado ─────────────────────────────────────────
  const filteredStock = stock.filter(s =>
    !stockSearch ||
    s.product_name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    (s.category_name || "").toLowerCase().includes(stockSearch.toLowerCase())
  );

  const subTabStyle = (key) => ({
    background: "transparent",
    color: subTab === key ? "#f0a500" : "#555",
    border: "none",
    borderBottom: subTab === key ? "2px solid #f0a500" : "2px solid transparent",
    padding: "8px 18px", cursor: "pointer", fontFamily: "inherit", fontSize: 12,
    fontWeight: subTab === key ? "bold" : "normal",
    letterSpacing: 1, marginBottom: -2,
  });

  const inp = {
    width: "100%", background: "#0f0f0f", border: "1px solid #333",
    color: "#e8e0d0", padding: "8px 10px", borderRadius: 4,
    fontFamily: "inherit", fontSize: 13, boxSizing: "border-box",
  };

  return (
    <div>
      {/* Sub-navegación */}
      <div style={{ display:"flex",gap:0,marginBottom:24,borderBottom:"2px solid #1e1e1e" }}>
        {[["almacenes","ALMACENES"],["stock","STOCK"],["transferencias","TRANSFERENCIAS"]].map(([key,label]) => (
          <button key={key} onClick={() => setSubTab(key)} style={subTabStyle(key)}>{label}</button>
        ))}
      </div>

      {/* ── ALMACENES ── */}
      {subTab === "almacenes" && (
        <div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",gap:12,marginBottom:28 }}>
            {warehouses.map(w => (
              <div key={w.id} style={{ background:"#1a1a1a",border:`1px solid ${w.active?"#2a2a2a":"#1e1e1e"}`,borderRadius:6,padding:16,opacity:w.active?1:0.6 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10 }}>
                  <div>
                    <div style={{ fontWeight:"bold",fontSize:14,color:"#e8e0d0",marginBottom:2 }}>{w.name}</div>
                    {w.description && <div style={{ fontSize:11,color:"#555" }}>{w.description}</div>}
                  </div>
                  <span style={{ fontSize:10,color:w.active?"#27ae60":"#e74c3c",border:`1px solid ${w.active?"#27ae60":"#e74c3c"}`,padding:"2px 7px",borderRadius:3 }}>
                    {w.active?"Activo":"Inactivo"}
                  </span>
                </div>
                <div style={{ display:"flex",gap:16,marginBottom:12 }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:18,fontWeight:"bold",color:"#f0a500" }}>{w.product_count||0}</div>
                    <div style={{ fontSize:10,color:"#555" }}>productos</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:18,fontWeight:"bold",color:"#5dade2" }}>{parseFloat(w.total_stock||0).toFixed(0)}</div>
                    <div style={{ fontSize:10,color:"#555" }}>unidades</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:18,fontWeight:"bold",color:"#9b59b6" }}>{(w.assigned_employees||[]).length}</div>
                    <div style={{ fontSize:10,color:"#555" }}>empleados</div>
                  </div>
                </div>
                <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                  <button onClick={() => { setSelectedWarehouse(w); setSubTab("stock"); }} style={{ ...btnSmall,color:"#5dade2",borderColor:"#2980b9" }}>Ver stock</button>
                  <button onClick={() => openAssign(w)} style={{ ...btnSmall,color:"#9b59b6",borderColor:"#8e44ad" }}>Empleados</button>
                  <button onClick={() => startEdit(w)} style={{ ...btnSmall,color:"#f0a500",borderColor:"#f0a500" }}>Editar</button>
                  <button onClick={() => deleteWarehouse(w.id)} style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18,maxWidth:600 }}>
            <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:16 }}>
              {editId?"✏ EDITAR ALMACÉN":"+ NUEVO ALMACÉN"}
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
              <div>
                <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Nombre *</div>
                <input value={form.name} onChange={e => setForm(p => ({...p,name:e.target.value}))} placeholder="ej. Depósito Central" style={inp} />
              </div>
              <div>
                <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Orden</div>
                <input type="number" value={form.sort_order} onChange={e => setForm(p => ({...p,sort_order:parseInt(e.target.value)||0}))} style={inp} />
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Descripción</div>
              <input value={form.description} onChange={e => setForm(p => ({...p,description:e.target.value}))} placeholder="ej. Almacén principal" style={inp} />
            </div>
            {editId && (
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer" }}>
                  <input type="checkbox" checked={form.active??true} onChange={e => setForm(p => ({...p,active:e.target.checked}))} />
                  <span style={{ color:"#888" }}>Activo</span>
                </label>
              </div>
            )}
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={saveWarehouse} disabled={loading}
                style={{ background:"#f0a500",color:"#0f0f0f",border:"none",padding:"8px 24px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:13 }}>
                {loading?"Guardando...":editId?"Guardar cambios":"Crear almacén"}
              </button>
              {editId && <button onClick={cancelEdit} style={{ ...btnSmall,padding:"8px 16px",fontSize:12 }}>Cancelar</button>}
            </div>
          </div>
        </div>
      )}

      {/* ── STOCK ── */}
      {subTab === "stock" && (
        <div>
          {/* Selector de almacén + búsqueda + botón agregar */}
          <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom:20,flexWrap:"wrap" }}>
            <div style={{ fontSize:11,color:"#555",letterSpacing:1 }}>ALMACÉN:</div>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
              {warehouses.filter(w => w.active).map(w => (
                <button key={w.id} onClick={() => { setSelectedWarehouse(w); loadStock(w.id); }}
                  style={{ background:selectedWarehouse?.id===w.id?"#f0a500":"#1a1a1a",color:selectedWarehouse?.id===w.id?"#0f0f0f":"#888",border:`1px solid ${selectedWarehouse?.id===w.id?"#f0a500":"#333"}`,padding:"6px 14px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:selectedWarehouse?.id===w.id?"bold":"normal" }}>
                  {w.name}
                </button>
              ))}
            </div>
            {selectedWarehouse && (
              <>
                <input value={stockSearch} onChange={e => setStockSearch(e.target.value)}
                  placeholder="🔍 Buscar producto..."
                  style={{ marginLeft:"auto",background:"#1a1a1a",border:"1px solid #333",color:"#e8e0d0",padding:"7px 12px",borderRadius:4,fontFamily:"inherit",fontSize:12,minWidth:200 }} />
                {/* ── Botón agregar producto manualmente ── */}
                <button onClick={openAddStock}
                  style={{ background:"#27ae60",color:"#fff",border:"none",padding:"7px 16px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:12,whiteSpace:"nowrap" }}>
                  + Agregar producto
                </button>
              </>
            )}
          </div>

          {!selectedWarehouse ? (
            <div style={{ textAlign:"center",color:"#444",padding:"40px 0",fontSize:13 }}>
              Selecciona un almacén para ver su stock
            </div>
          ) : loadingStock ? (
            <div style={{ textAlign:"center",color:"#555",padding:"40px 0" }}>Cargando...</div>
          ) : (
            <>
              <div style={{ fontSize:11,color:"#555",marginBottom:12 }}>
                {filteredStock.length} producto{filteredStock.length!==1?"s":""} en <b style={{ color:"#f0a500" }}>{selectedWarehouse.name}</b>
              </div>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:"2px solid #f0a500",color:"#f0a500" }}>
                    {["Categoría","Producto","Stock","Unidad","Precio venta","Costo"].map(h => (
                      <th key={h} style={{ textAlign:"left",padding:"8px 12px",fontSize:11,letterSpacing:1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.length === 0
                    ? <tr><td colSpan={6} style={{ textAlign:"center",color:"#444",padding:"30px 0" }}>
                        Sin productos en este almacén —{" "}
                        <span onClick={openAddStock} style={{ color:"#27ae60",cursor:"pointer",textDecoration:"underline" }}>
                          agregar uno
                        </span>
                      </td></tr>
                    : filteredStock.map((s,i) => {
                        const stockColor = parseFloat(s.qty)<=0?"#e74c3c":parseFloat(s.qty)<=5?"#f0a500":"#27ae60";
                        return (
                          <tr key={s.product_id} style={{ background:i%2===0?"#111":"transparent",borderBottom:"1px solid #1e1e1e" }}>
                            <td style={{ padding:"10px 12px",color:"#555",fontSize:11 }}>{s.category_name||"—"}</td>
                            <td style={{ padding:"10px 12px",fontWeight:"bold" }}>{s.product_name}</td>
                            <td style={{ padding:"10px 12px" }}>
                              <span style={{ color:stockColor,fontWeight:"bold",fontSize:15 }}>{parseFloat(s.qty).toFixed(s.qty%1!==0?3:0)}</span>
                            </td>
                            <td style={{ padding:"10px 12px",color:"#555",fontSize:11 }}>{s.unit||"unidad"}</td>
                            <td style={{ padding:"10px 12px",color:"#f0a500" }}>${parseFloat(s.price||0).toFixed(2)}</td>
                            <td style={{ padding:"10px 12px",color:"#888" }}>{s.cost_price?`$${parseFloat(s.cost_price).toFixed(2)}`:"—"}</td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* ── TRANSFERENCIAS ── */}
      {subTab === "transferencias" && (
        <div>
          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:20,marginBottom:24,maxWidth:700 }}>
            <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:16 }}>NUEVA TRANSFERENCIA</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
              <div>
                <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Origen (opcional)</div>
                <select value={transferForm.from_warehouse_id} onChange={e => setTransferForm(p => ({...p,from_warehouse_id:e.target.value}))} style={inp}>
                  <option value="">— Entrada externa</option>
                  {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Destino *</div>
                <select value={transferForm.to_warehouse_id} onChange={e => setTransferForm(p => ({...p,to_warehouse_id:e.target.value}))} style={inp}>
                  <option value="">— Seleccionar almacén</option>
                  {warehouses.filter(w => w.active && w.id!==parseInt(transferForm.from_warehouse_id)).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr",gap:12,marginBottom:12 }}>
              <div>
                <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Producto *</div>
                <select value={transferForm.product_id} onChange={e => setTransferForm(p => ({...p,product_id:e.target.value}))} style={inp}>
                  <option value="">— Seleccionar producto</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Cantidad *</div>
                <input type="number" min="0.001" step="0.001" value={transferForm.qty}
                  onChange={e => setTransferForm(p => ({...p,qty:e.target.value}))} placeholder="0" style={inp} />
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Nota (opcional)</div>
              <input value={transferForm.note} onChange={e => setTransferForm(p => ({...p,note:e.target.value}))}
                placeholder="ej. Reposición semanal de tienda" style={inp} />
            </div>
            <button onClick={doTransfer} disabled={loadingTransfer}
              style={{ background:loadingTransfer?"#7a5200":"#f0a500",color:"#0f0f0f",border:"none",padding:"9px 28px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:loadingTransfer?"not-allowed":"pointer",fontSize:13 }}>
              {loadingTransfer?"Transfiriendo...":"Registrar transferencia"}
            </button>
          </div>

          <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:14 }}>HISTORIAL DE MOVIMIENTOS</div>
          {transfers.length === 0
            ? <div style={{ textAlign:"center",color:"#444",padding:"30px 0",fontSize:13 }}>Sin transferencias registradas</div>
            : <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:"2px solid #f0a500",color:"#f0a500" }}>
                    {["Fecha","Producto","Origen","Destino","Cantidad","Nota","Empleado"].map(h => (
                      <th key={h} style={{ textAlign:"left",padding:"8px 12px",fontSize:11,letterSpacing:1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t,i) => (
                    <tr key={t.id} style={{ background:i%2===0?"#111":"transparent",borderBottom:"1px solid #1e1e1e" }}>
                      <td style={{ padding:"10px 12px",color:"#555",fontSize:11,whiteSpace:"nowrap" }}>{new Date(t.created_at).toLocaleString("es-VE")}</td>
                      <td style={{ padding:"10px 12px",fontWeight:"bold" }}>{t.product_name}</td>
                      <td style={{ padding:"10px 12px" }}>{t.from_warehouse_name?<span style={{ color:"#e74c3c",fontSize:12 }}>📤 {t.from_warehouse_name}</span>:<span style={{ color:"#555",fontSize:11 }}>Entrada externa</span>}</td>
                      <td style={{ padding:"10px 12px" }}><span style={{ color:"#27ae60",fontSize:12 }}>📥 {t.to_warehouse_name}</span></td>
                      <td style={{ padding:"10px 12px",color:"#f0a500",fontWeight:"bold" }}>{parseFloat(t.qty).toFixed(t.qty%1!==0?3:0)}</td>
                      <td style={{ padding:"10px 12px",color:"#666",fontSize:11 }}>{t.note||"—"}</td>
                      <td style={{ padding:"10px 12px",color:"#888",fontSize:11 }}>{t.employee_name||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      )}

      {/* ── MODAL: Agregar producto al almacén ── */}
      {addStockModal && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
          <div style={{ background:"#1a1a1a",border:"1px solid #27ae60",borderRadius:6,padding:24,width:"100%",maxWidth:480 }}>
            <div style={{ fontWeight:"bold",fontSize:14,color:"#27ae60",letterSpacing:2,marginBottom:6 }}>
              + AGREGAR PRODUCTO
            </div>
            <div style={{ fontSize:12,color:"#555",marginBottom:20 }}>
              Almacén: <b style={{ color:"#e8e0d0" }}>{selectedWarehouse?.name}</b>
            </div>

            {/* Búsqueda de producto */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Producto *</div>
              {addStockProduct
                ? <div style={{ display:"flex",alignItems:"center",gap:10,background:"#0d1f2b",border:"1px solid #2980b9",borderRadius:4,padding:"8px 12px" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13,fontWeight:"bold",color:"#5dade2" }}>{addStockProduct.name}</div>
                      <div style={{ fontSize:10,color:"#555" }}>{addStockProduct.category_name||"Sin categoría"} · Stock total: {addStockProduct.stock}</div>
                    </div>
                    <button onClick={() => { setAddStockProduct(null); setAddStockForm(EMPTY_ADD_STOCK); }}
                      style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>✕</button>
                  </div>
                : <div style={{ position:"relative" }}>
                    <input value={addStockSearch} onChange={e => setAddStockSearch(e.target.value)}
                      placeholder="Buscar producto..."
                      style={inp} />
                    {addStockResults.length > 0 && (
                      <div style={{ position:"absolute",top:"100%",left:0,right:0,background:"#1e1e1e",border:"1px solid #333",borderRadius:4,zIndex:10,maxHeight:200,overflowY:"auto" }}>
                        {addStockResults.map(p => (
                          <div key={p.id} onClick={() => selectAddStockProduct(p)}
                            style={{ padding:"10px 12px",cursor:"pointer",borderBottom:"1px solid #222",fontSize:13 }}
                            onMouseEnter={e => e.currentTarget.style.background="#2a2a2a"}
                            onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                            <div style={{ fontWeight:"bold" }}>{p.name}</div>
                            <div style={{ fontSize:10,color:"#555" }}>{p.category_name||"Sin categoría"} · Stock total: {p.stock} {p.unit}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
              }
            </div>

            {/* Cantidad */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Cantidad inicial *</div>
              <input type="number" min="0" step="0.001"
                value={addStockForm.qty}
                onChange={e => setAddStockForm(p => ({...p,qty:e.target.value}))}
                placeholder="0"
                style={inp} />
              <div style={{ fontSize:10,color:"#555",marginTop:4 }}>
                Puedes ingresar 0 para registrar el producto sin stock inicial
              </div>
            </div>

            <div style={{ display:"flex",gap:10 }}>
              <button onClick={doAddStock} disabled={savingStock}
                style={{ background:savingStock?"#1a3a1a":"#27ae60",color:"#fff",border:"none",padding:"8px 24px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:savingStock?"not-allowed":"pointer",fontSize:13 }}>
                {savingStock?"Guardando...":"Agregar al almacén"}
              </button>
              <button onClick={() => setAddStockModal(false)}
                style={{ ...btnSmall,padding:"8px 16px",fontSize:12 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Asignar empleados ── */}
      {assignModal && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
          <div style={{ background:"#1a1a1a",border:"1px solid #f0a500",borderRadius:6,padding:24,width:"100%",maxWidth:420 }}>
            <div style={{ fontWeight:"bold",fontSize:14,color:"#f0a500",letterSpacing:2,marginBottom:6 }}>ASIGNAR EMPLEADOS</div>
            <div style={{ fontSize:12,color:"#555",marginBottom:18 }}>Almacén: <b style={{ color:"#e8e0d0" }}>{assignModal.name}</b></div>
            <div style={{ display:"flex",flexDirection:"column",gap:8,maxHeight:300,overflowY:"auto",marginBottom:20 }}>
              {employees.map(emp => (
                <label key={emp.id} style={{ display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 10px",borderRadius:4,background:assignSelected.includes(emp.id)?"#0d1f2b":"transparent",border:`1px solid ${assignSelected.includes(emp.id)?"#2980b9":"#2a2a2a"}` }}>
                  <input type="checkbox" checked={assignSelected.includes(emp.id)} onChange={() => toggleAssign(emp.id)} />
                  <div>
                    <div style={{ fontSize:13,fontWeight:"bold",color:assignSelected.includes(emp.id)?"#5dade2":"#e8e0d0" }}>{emp.full_name}</div>
                    <div style={{ fontSize:10,color:"#555" }}>{emp.role_label||emp.role} · @{emp.username}</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={saveAssign} style={{ background:"#f0a500",color:"#0f0f0f",border:"none",padding:"8px 24px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:13 }}>Guardar</button>
              <button onClick={() => setAssignModal(null)} style={{ ...btnSmall,padding:"8px 16px",fontSize:12 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}