import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";

const EMPTY_WAREHOUSE = { name: "", description: "", sort_order: 0, active: true };
const EMPTY_ADD_STOCK = { product_id: "", qty: "" };

export default function WarehousesTab({ notify, currentEmployee }) {
  const [subTab, setSubTab] = useState("almacenes");

  // ── Almacenes ──────────────────────────────────────────────
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm]             = useState(EMPTY_WAREHOUSE);
  const [editId, setEditId]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [warehouseModal, setWarehouseModal] = useState(false);

  // ── Stock ──────────────────────────────────────────────────
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [stock, setStock]               = useState([]);
  const [stockSearch, setStockSearch]   = useState("");
  const [loadingStock, setLoadingStock] = useState(false);

  // ── Editar o Eliminar Stock (Modals) ───────────────────────
  const [editStockModal, setEditStockModal]     = useState(null); // { product_id, product_name, qty }
  const [deleteStockModal, setDeleteStockModal] = useState(null); // { product_id, product_name }
  const [editStockValue, setEditStockValue]     = useState("");

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
  const [transferModal, setTransferModal]     = useState(false);

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
    try { const r = await api.products.getAll({ is_combo: false, is_service: false }); setProducts(r.data); }
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
      try { const r = await api.products.getAll({ search: addStockSearch, is_service: false }); setAddStockResults(r.data.slice(0, 8)); }
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
      setForm(EMPTY_WAREHOUSE); setEditId(null); setWarehouseModal(false);
      await loadWarehouses();
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  };

  const deleteWarehouse = async (id) => {
    if (!confirm("¿Eliminar este almacén? Solo es posible si no tiene stock.")) return;
    try { await api.warehouses.remove(id); notify("Almacén eliminado"); await loadWarehouses(); }
    catch (e) { notify(e.message, "err"); }
  };

  const openNewWarehouse = () => { setEditId(null); setForm(EMPTY_WAREHOUSE); setWarehouseModal(true); };
  const startEdit  = (w) => { setEditId(w.id); setForm({ name: w.name, description: w.description || "", sort_order: w.sort_order, active: w.active ?? true }); setWarehouseModal(true); };
  const cancelEdit = ()  => { setEditId(null); setForm(EMPTY_WAREHOUSE); setWarehouseModal(false); };

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
    if (!from_warehouse_id || !to_warehouse_id || !product_id || !qty)
      return notify("Origen, destino, producto y cantidad son requeridos", "err");
    setLoadingTransfer(true);
    try {
      await api.warehouses.transfer({
        from_warehouse_id: parseInt(from_warehouse_id),
        to_warehouse_id:   parseInt(to_warehouse_id),
        product_id:        parseInt(product_id),
        qty:               parseFloat(qty),
        note:              note || null,
      });
      notify("Transferencia registrada ✓");
      setTransferForm({ from_warehouse_id: "", to_warehouse_id: "", product_id: "", qty: "", note: "" });
      setTransferModal(false);
      await loadTransfers(); await loadWarehouses();
    } catch (e) { notify(e.message, "err"); }
    finally { setLoadingTransfer(false); }
  };

  // ── Editar o Eliminar Stock manualmente ──────────────────────
  const handleEditStock = (item) => {
    if (item.is_combo) {
      notify("El stock de un combo es calculado automáticamente y no puede editarse manualmente.", "warning");
      return;
    }
    const currentQty = parseFloat(item.qty).toFixed(item.qty % 1 !== 0 ? 3 : 0);
    setEditStockValue(currentQty);
    setEditStockModal(item);
  };

  const submitEditStock = async (e) => {
    e.preventDefault();
    if (!editStockModal) return;
    const qty = parseFloat(editStockValue);
    if (isNaN(qty) || qty < 0) return notify("Cantidad inválida", "err");

    try {
      await api.warehouses.setStock(selectedWarehouse.id, editStockModal.product_id, { qty });
      notify("Stock actualizado ✓");
      loadStock(selectedWarehouse.id);
      setEditStockModal(null);
    } catch (err) { notify(err.message, "err"); }
  };

  const handleDeleteStock = (item) => {
    setDeleteStockModal(item);
  };

  const confirmDeleteStock = async () => {
    if (!deleteStockModal) return;
    try {
      await api.warehouses.removeStock(selectedWarehouse.id, deleteStockModal.product_id);
      notify("Producto retirado del almacén ✓");
      loadStock(selectedWarehouse.id);
      setDeleteStockModal(null);
    } catch (err) { notify(err.message, "err"); }
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
    !s.is_service && (
    !stockSearch ||
    s.product_name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    (s.category_name || "").toLowerCase().includes(stockSearch.toLowerCase())
    )
  );

  return (
    <div>
      {/* Sub-navegación */}
      <div className="flex gap-0 mb-6 border-b-2 border-surface-3 dark:border-surface-dark-3">
        {[["almacenes","ALMACENES"],["stock","STOCK"],["transferencias","TRANSFERENCIAS"]].map(([key,label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={[
              "px-[18px] py-2 text-[12px] tracking-widest font-inherit bg-transparent border-none cursor-pointer -mb-0.5 transition-colors",
              subTab === key
                ? "text-warning border-b-2 border-warning font-bold"
                : "text-content-muted dark:text-content-dark-muted border-b-2 border-transparent hover:text-content dark:hover:text-content-dark",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── ALMACENES ── */}
      {subTab === "almacenes" && (
        <div>
          {/* Botón nuevo almacén */}
          <div className="flex justify-end mb-4">
            <button onClick={openNewWarehouse} className="btn-md btn-primary">
              + Nuevo Almacén
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {warehouses.map(w => (
              <div
                key={w.id}
                className={[
                  "card-md p-4 transition-opacity",
                  w.active ? "opacity-100" : "opacity-60",
                ].join(" ")}
              >
                <div className="flex justify-between items-start mb-2.5">
                  <div>
                    <div className="font-bold text-sm text-content dark:text-content-dark mb-0.5">{w.name}</div>
                    {w.description && <div className="text-[11px] text-content-muted dark:text-content-dark-muted">{w.description}</div>}
                  </div>
                  <span className={[
                    "text-[10px] border px-1.5 py-0.5 rounded-sm",
                    w.active
                      ? "text-success border-success"
                      : "text-danger border-danger",
                  ].join(" ")}>
                    {w.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="flex gap-4 mb-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-warning">{w.product_count || 0}</div>
                    <div className="text-[10px] text-content-muted dark:text-content-dark-muted">productos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-info">{parseFloat(w.total_stock || 0).toFixed(0)}</div>
                    <div className="text-[10px] text-content-muted dark:text-content-dark-muted">unidades</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-violet-500">{(w.assigned_employees || []).length}</div>
                    <div className="text-[10px] text-content-muted dark:text-content-dark-muted">empleados</div>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => { setSelectedWarehouse(w); setSubTab("stock"); }}
                    className="btn-sm text-info border border-info/60 hover:border-info bg-transparent"
                  >
                    Ver stock
                  </button>
                  <button
                    onClick={() => openAssign(w)}
                    className="btn-sm text-violet-500 border border-violet-600/60 hover:border-violet-500 bg-transparent"
                  >
                    Empleados
                  </button>
                  <button
                    onClick={() => startEdit(w)}
                    className="btn-sm text-warning border border-warning/60 hover:border-warning bg-transparent"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => deleteWarehouse(w.id)}
                    className="btn-sm text-danger border border-danger/60 hover:border-danger bg-transparent"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STOCK ── */}
      {subTab === "stock" && (
        <div>
          {/* Selector de almacén + búsqueda + botón agregar */}
          <div className="flex gap-2.5 items-center mb-5 flex-wrap">
            <div className="text-[11px] text-content-muted dark:text-content-dark-muted tracking-widest">ALMACÉN:</div>
            <div className="flex gap-1.5 flex-wrap">
              {warehouses.filter(w => w.active).map(w => (
                <button
                  key={w.id}
                  onClick={() => { setSelectedWarehouse(w); loadStock(w.id); }}
                  className={[
                    "px-3.5 py-1.5 rounded border text-[12px] cursor-pointer transition-colors",
                    selectedWarehouse?.id === w.id
                      ? "bg-warning text-surface-1 dark:text-surface-dark-1 border-warning font-bold"
                      : "bg-surface-2 dark:bg-surface-dark-2 text-content-muted dark:text-content-dark-muted border-surface-3 dark:border-surface-dark-3 hover:border-content-muted dark:hover:border-content-dark-muted font-normal",
                  ].join(" ")}
                >
                  {w.name}
                </button>
              ))}
            </div>
            {selectedWarehouse && (
              <>
                <input
                  value={stockSearch}
                  onChange={e => setStockSearch(e.target.value)}
                  placeholder="🔍 Buscar producto..."
                  className="input ml-auto min-w-[200px]"
                />
                <button onClick={openAddStock} className="btn-sm btn-success whitespace-nowrap">
                  + Agregar producto
                </button>
              </>
            )}
          </div>

          {!selectedWarehouse ? (
            <div className="text-center text-surface-3 dark:text-surface-dark-3 py-10 text-[13px]">
              Selecciona un almacén para ver su stock
            </div>
          ) : loadingStock ? (
            <div className="text-center text-content-muted dark:text-content-dark-muted py-10">Cargando...</div>
          ) : (
            <>
              <div className="text-[11px] text-content-muted dark:text-content-dark-muted mb-3">
                {filteredStock.length} producto{filteredStock.length !== 1 ? "s" : ""} en{" "}
                <b className="text-warning">{selectedWarehouse.name}</b>
              </div>
              <table className="table-pos">
                <thead>
                  <tr className="border-b-2 border-warning text-warning">
                    {["Categoría","Producto","Stock","Unidad","Precio venta","Costo","Acciones"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[11px] tracking-widest font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.length === 0
                    ? (
                      <tr>
                        <td colSpan={7} className="text-center text-content-muted dark:text-content-dark-muted py-8 px-3">
                          Sin productos en este almacén —{" "}
                          <span
                            onClick={openAddStock}
                            className="text-success cursor-pointer underline"
                          >
                            agregar uno
                          </span>
                        </td>
                      </tr>
                    )
                    : filteredStock.map((s, i) => {
                        const stockColorClass =
                          parseFloat(s.qty) <= 0
                            ? "text-danger"
                            : parseFloat(s.qty) <= 5
                            ? "text-warning"
                            : "text-success";
                        return (
                          <tr
                            key={s.product_id}
                            className={[
                              "border-b border-surface-3 dark:border-surface-dark-3 hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors",
                              i % 2 === 0 ? "bg-surface-1 dark:bg-surface-dark-1" : "bg-transparent",
                            ].join(" ")}
                          >
                            <td className="px-3 py-2.5 text-content-muted dark:text-content-dark-muted text-[11px]">{s.category_name || "—"}</td>
                            <td className="px-3 py-2.5 font-bold text-content dark:text-content-dark">{s.product_name} {s.is_combo && <span className="ml-1 text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded">Combo/Virtual</span>}</td>
                            <td className="px-3 py-2.5">
                              <span className={`${stockColorClass} font-bold text-[15px]`}>
                                {parseFloat(s.qty).toFixed(s.qty % 1 !== 0 ? 3 : 0)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-content-muted dark:text-content-dark-muted text-[11px]">{s.unit || "unidad"}</td>
                            <td className="px-3 py-2.5 text-warning">${parseFloat(s.price || 0).toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-content-muted dark:text-content-dark-muted">
                              {s.cost_price != null ? `$${parseFloat(s.cost_price).toFixed(2)}` : "—"}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditStock(s)}
                                  className="text-[11px] text-info hover:text-info-dark transition-colors"
                                  title="Editar cantidad"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDeleteStock(s)}
                                  className="text-[11px] text-danger hover:text-danger-dark transition-colors"
                                  title="Retirar del almacén"
                                >
                                  ❌
                                </button>
                              </div>
                            </td>
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
          {/* Botón nueva transferencia */}
          <div className="flex justify-end mb-4">
            <button onClick={() => setTransferModal(true)} className="btn-md btn-primary">
              + Nueva Transferencia
            </button>
          </div>

          <div className="font-bold text-[13px] text-warning tracking-widest mb-3.5">HISTORIAL DE MOVIMIENTOS</div>
          {transfers.length === 0 ? (
            <div className="text-center text-content-muted dark:text-content-dark-muted py-8 text-[13px]">
              Sin transferencias registradas
            </div>
          ) : (
            <table className="table-pos">
              <thead>
                <tr className="border-b-2 border-warning text-warning">
                  {["Fecha","Producto","Origen","Destino","Cantidad","Nota","Empleado"].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[11px] tracking-widest font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfers.map((t, i) => (
                  <tr
                    key={t.id}
                    className={[
                      "border-b border-surface-3 dark:border-surface-dark-3",
                      i % 2 === 0 ? "bg-surface-1 dark:bg-surface-dark-1" : "bg-transparent",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2.5 text-content-muted dark:text-content-dark-muted text-[11px] whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString("es-VE")}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-content dark:text-content-dark">{t.product_name}</td>
                    <td className="px-3 py-2.5">
                      {t.from_warehouse_name
                        ? <span className="text-danger text-[12px]">📤 {t.from_warehouse_name}</span>
                        : <span className="text-content-muted dark:text-content-dark-muted text-[11px]">Entrada externa</span>
                      }
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-success text-[12px]">📥 {t.to_warehouse_name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-warning font-bold">
                      {parseFloat(t.qty).toFixed(t.qty % 1 !== 0 ? 3 : 0)}
                    </td>
                    <td className="px-3 py-2.5 text-content-muted dark:text-content-dark-muted text-[11px]">{t.note || "—"}</td>
                    <td className="px-3 py-2.5 text-content-muted dark:text-content-dark-muted text-[11px]">{t.employee_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── MODAL: Nueva Transferencia ── */}
      {transferModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-5">
          <div className="card-md p-6 w-full max-w-[520px]">
            <div className="font-bold text-sm text-info tracking-widest mb-5">
              🔄 NUEVA TRANSFERENCIA
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="label mb-1">Origen *</div>
                <select
                  value={transferForm.from_warehouse_id}
                  onChange={e => setTransferForm(p => ({ ...p, from_warehouse_id: e.target.value, to_warehouse_id: p.to_warehouse_id === e.target.value ? "" : p.to_warehouse_id }))}
                  className="input"
                >
                  <option value="">— Seleccionar origen</option>
                  {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <div className="label mb-1">Destino *</div>
                <select
                  value={transferForm.to_warehouse_id}
                  onChange={e => setTransferForm(p => ({ ...p, to_warehouse_id: e.target.value }))}
                  className="input"
                >
                  <option value="">— Seleccionar destino</option>
                  {warehouses.filter(w => w.active && w.id !== parseInt(transferForm.from_warehouse_id)).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-[2fr_1fr] gap-3 mb-3">
              <div>
                <div className="label mb-1">Producto *</div>
                <select
                  value={transferForm.product_id}
                  onChange={e => setTransferForm(p => ({ ...p, product_id: e.target.value }))}
                  className="input"
                >
                  <option value="">— Seleccionar producto</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <div className="label mb-1">Cantidad *</div>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={transferForm.qty}
                  onChange={e => setTransferForm(p => ({ ...p, qty: e.target.value }))}
                  placeholder="0"
                  className="input"
                />
              </div>
            </div>

            <div className="mb-5">
              <div className="label mb-1">Nota (opcional)</div>
              <input
                value={transferForm.note}
                onChange={e => setTransferForm(p => ({ ...p, note: e.target.value }))}
                placeholder="ej. Reposición semanal de tienda"
                className="input"
              />
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={doTransfer}
                disabled={loadingTransfer}
                className={`btn-md ${loadingTransfer ? "btn-secondary opacity-60 cursor-not-allowed" : "btn-primary"}`}
              >
                {loadingTransfer ? "Transfiriendo..." : "Registrar transferencia"}
              </button>
              <button
                onClick={() => { setTransferModal(false); setTransferForm({ from_warehouse_id: "", to_warehouse_id: "", product_id: "", qty: "", note: "" }); }}
                className="btn-sm btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Crear / Editar Almacén ── */}
      {warehouseModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-5">
          <div className="card-md p-6 w-full max-w-[480px]">
            <div className="font-bold text-sm text-warning tracking-widest mb-5">
              {editId ? "✏ EDITAR ALMACÉN" : "+ NUEVO ALMACÉN"}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="label mb-1">Nombre *</div>
                <input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="ej. Depósito Central"
                  className="input"
                  autoFocus
                />
              </div>
              <div>
                <div className="label mb-1">Orden</div>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                  className="input"
                />
              </div>
            </div>

            <div className="mb-3.5">
              <div className="label mb-1">Descripción</div>
              <input
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="ej. Almacén principal"
                className="input"
              />
            </div>

            {editId && (
              <div className="mb-4">
                <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active ?? true}
                    onChange={e => setForm(p => ({ ...p, active: e.target.checked }))}
                  />
                  <span className="text-content-muted dark:text-content-dark-muted">Activo</span>
                </label>
              </div>
            )}

            <div className="flex gap-2.5">
              <button onClick={saveWarehouse} disabled={loading} className="btn-md btn-primary">
                {loading ? "Guardando..." : editId ? "Guardar cambios" : "Crear almacén"}
              </button>
              <button onClick={cancelEdit} className="btn-sm btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Agregar producto al almacén ── */}
      {addStockModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-5">
          <div className="card-md p-6 w-full max-w-[480px]">
            <div className="font-bold text-sm text-success tracking-widest mb-1.5">
              + AGREGAR PRODUCTO
            </div>
            <div className="text-[12px] text-content-muted dark:text-content-dark-muted mb-5">
              Almacén: <b className="text-content dark:text-content-dark">{selectedWarehouse?.name}</b>
            </div>

            {/* Búsqueda de producto */}
            <div className="mb-4">
              <div className="label mb-1">Producto *</div>
              {addStockProduct ? (
                <div className="flex items-center gap-2.5 bg-info/10 border border-info/40 rounded px-3 py-2">
                  <div className="flex-1">
                    <div className="text-[13px] font-bold text-info">{addStockProduct.name}</div>
                    <div className="text-[10px] text-content-muted dark:text-content-dark-muted">
                      {addStockProduct.category_name || "Sin categoría"} · Stock total: {addStockProduct.stock}
                    </div>
                  </div>
                  <button
                    onClick={() => { setAddStockProduct(null); setAddStockForm(EMPTY_ADD_STOCK); }}
                    className="btn-sm text-danger border border-danger/60 hover:border-danger bg-transparent"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={addStockSearch}
                    onChange={e => setAddStockSearch(e.target.value)}
                    placeholder="Buscar producto..."
                    className="input"
                  />
                  {addStockResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-lg z-10 max-h-48 overflow-y-auto shadow-xl">
                      {addStockResults.map(p => (
                        <div
                          key={p.id}
                          onClick={() => selectAddStockProduct(p)}
                          className="px-3 py-2.5 cursor-pointer border-b border-surface-3 dark:border-surface-dark-3 text-[13px] hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors"
                        >
                          <div className="font-bold text-content dark:text-content-dark">{p.name}</div>
                          <div className="text-[10px] text-content-muted dark:text-content-dark-muted">
                            {p.category_name || "Sin categoría"} · Stock total: {p.stock} {p.unit}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cantidad */}
            <div className="mb-5">
              <div className="label mb-1">Cantidad inicial *</div>
              <input
                type="number"
                min="0"
                step="0.001"
                value={addStockForm.qty}
                onChange={e => setAddStockForm(p => ({ ...p, qty: e.target.value }))}
                placeholder="0"
                className="input"
              />
              <div className="text-[10px] text-content-muted dark:text-content-dark-muted mt-1">
                Puedes ingresar 0 para registrar el producto sin stock inicial
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={doAddStock}
                disabled={savingStock}
                className={`btn-md ${savingStock ? "btn-secondary opacity-60 cursor-not-allowed" : "btn-success"}`}
              >
                {savingStock ? "Guardando..." : "Agregar al almacén"}
              </button>
              <button onClick={() => setAddStockModal(false)} className="btn-sm btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Asignar empleados ── */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-5">
          <div className="card-md p-6 w-full max-w-[420px]">
            <div className="font-bold text-sm text-warning tracking-widest mb-1.5">ASIGNAR EMPLEADOS</div>
            <div className="text-[12px] text-content-muted dark:text-content-dark-muted mb-4.5">
              Almacén: <b className="text-content dark:text-content-dark">{assignModal.name}</b>
            </div>
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto mb-5">
              {employees.map(emp => (
                <label
                  key={emp.id}
                  className={[
                    "flex items-center gap-2.5 cursor-pointer px-2.5 py-2 rounded border transition-colors",
                    assignSelected.includes(emp.id)
                      ? "bg-info/10 border-info/40"
                      : "bg-transparent border-surface-3 dark:border-surface-dark-3 hover:border-content-muted dark:hover:border-content-dark-muted",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={assignSelected.includes(emp.id)}
                    onChange={() => toggleAssign(emp.id)}
                  />
                  <div>
                    <div className={`text-[13px] font-bold ${assignSelected.includes(emp.id) ? "text-info" : "text-content dark:text-content-dark"}`}>
                      {emp.full_name}
                    </div>
                    <div className="text-[10px] text-content-muted dark:text-content-dark-muted">
                      {emp.role_label || emp.role} · @{emp.username}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2.5">
              <button onClick={saveAssign} className="btn-md btn-primary">Guardar</button>
              <button onClick={() => setAssignModal(null)} className="btn-sm btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Editar Stock ── */}
      {editStockModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-5">
          <form onSubmit={submitEditStock} className="card-md p-6 w-full max-w-[340px]">
            <div className="font-bold text-sm text-warning tracking-widest mb-1.5">EDITAR STOCK</div>
            <div className="text-[12px] text-content-muted dark:text-content-dark-muted mb-4.5">
              Producto: <b className="text-content dark:text-content-dark">{editStockModal.product_name}</b>
            </div>
            
            <div className="mb-5">
               <label className="label mb-1">Nueva cantidad *</label>
               <input autoFocus type="number" step="0.001" min="0" value={editStockValue} onChange={e => setEditStockValue(e.target.value)} required className="input w-full" />
            </div>

            <div className="flex gap-2.5">
              <button type="submit" className="btn-md btn-primary">Guardar</button>
              <button type="button" onClick={() => setEditStockModal(null)} className="btn-sm btn-secondary">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: Eliminar Stock ── */}
      {deleteStockModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-5">
          <div className="card-md p-6 w-full max-w-[340px]">
             <div className="text-danger flex justify-center mb-3">
               <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
             </div>
             <div className="font-bold text-center text-sm mb-1.5 text-content dark:text-content-dark">
               ¿Retirar producto?
             </div>
             <div className="text-center text-[12px] text-content-muted dark:text-content-dark-muted mb-5 leading-relaxed">
               Estás a punto de retirar <b>{deleteStockModal.product_name}</b> de este almacén de forma permanente.
             </div>
             
             <div className="flex gap-2.5 justify-center">
                <button onClick={confirmDeleteStock} className="btn-md btn-danger">Sí, retirar</button>
                <button onClick={() => setDeleteStockModal(null)} className="btn-md btn-secondary">Cancelar</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
