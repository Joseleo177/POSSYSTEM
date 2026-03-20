import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import CustomerModal from "./CustomerModal";
import ProductModal from "./ProductModal";

const PKG_UNITS = ["caja", "bulto", "paquete", "docena", "media caja", "fardo", "saco", "unidad"];

const EMPTY_ITEM = {
  product: null,
  package_unit: "",
  package_size: "",
  package_qty: 1,
  package_price: "",
  profit_margin: 30,
  update_price: true,
};

function calcItem(item) {
  const pkgSize = parseFloat(item.package_size) || 0;
  const pkgQty = parseFloat(item.package_qty) || 0;
  const pkgPrice = parseFloat(item.package_price) || 0;
  const margin = parseFloat(item.profit_margin) || 0;
  if (!pkgSize || !pkgPrice) return { unit_cost: 0, sale_price: 0, total_units: 0, subtotal: 0 };
  const unit_cost = pkgPrice / pkgSize;
  const sale_price = unit_cost * (1 + margin / 100);
  const total_units = pkgQty * pkgSize;
  const subtotal = pkgQty * pkgPrice;
  return { unit_cost, sale_price, total_units, subtotal };
}

const fmt2 = (n) => Number(n).toFixed(2);

export default function PurchasesTab({ notify, onProductsUpdated }) {
  const [view, setView] = useState("list"); // list | new | detail
  const [purchases, setPurchases] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── Almacenes ─────────────────────────────────────────────────
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");

  // New receipt form
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierResults, setSupplierResults] = useState([]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([]);

  // Supplier creation modal
  const [supplierModal, setSupplierModal] = useState(false);
  const [supplierEditData, setSupplierEditData] = useState(null);
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Product creation modal
  const [productModal, setProductModal] = useState(false);
  const [productEditData, setProductEditData] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [categories, setCategories] = useState([]);

  // Item being built
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // ── Load purchase list ────────────────────────────────────────
  const loadPurchases = useCallback(async () => {
    try { const r = await api.purchases.getAll(); setPurchases(r.data); }
    catch (e) { notify(e.message, "err"); }
  }, []);

  // ── Load warehouses ───────────────────────────────────────────
  const loadWarehouses = useCallback(async () => {
    try {
      const r = await api.warehouses.getAll();
      const active = r.data.filter(w => w.active);
      setWarehouses(active);
      // Auto-seleccionar el primero
      if (active.length === 1) setSelectedWarehouseId(String(active[0].id));
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadPurchases(); loadWarehouses(); }, [loadPurchases, loadWarehouses]);

  // ── Supplier creation ─────────────────────────────────────────
  const openCreateSupplier = (name = "") => {
    setSupplierEditData({ _newType: "proveedor", _newName: name });
    setSupplierModal(true);
  };
  const closeSupplierModal = () => { setSupplierModal(false); setSupplierEditData(null); };
  const saveSupplier = async (form) => {
    if (!form.name) return notify("El nombre es requerido", "err");
    setSavingSupplier(true);
    try {
      const res = await api.customers.create({ ...form, type: "proveedor" });
      notify("Proveedor registrado ✓");
      setSelectedSupplier(res.data);
      setSupplierSearch(""); setSupplierResults([]);
      closeSupplierModal();
    } catch (e) { notify(e.message, "err"); }
    setSavingSupplier(false);
  };

  // ── Product creation ──────────────────────────────────────────
  const openCreateProduct = (name = "") => {
    if (!categories.length) api.categories.getAll().then(r => setCategories(r.data)).catch(() => { });
    setProductEditData({ name });
    setProductModal(true);
  };
  const closeProductModal = () => { setProductModal(false); setProductEditData(null); };
  const saveProduct = async (form, imageFile) => {
    const { name, price, stock, category_id, unit, qty_step } = form;
    if (!name || !price) return notify("Nombre y precio son requeridos", "err");
    setSavingProduct(true);
    try {
      const payload = { name, price: +price, stock: +stock, category_id: category_id || null, unit: unit || "unidad", qty_step: +qty_step || 1 };
      const res = await api.products.create(payload, imageFile);
      notify("Producto creado ✓");
      if (res?.data) selectProduct(res.data);
      closeProductModal(); setProductSearch("");
    } catch (e) { notify(e.message, "err"); }
    setSavingProduct(false);
  };

  // ── Supplier search ───────────────────────────────────────────
  useEffect(() => {
    if (!supplierSearch.trim()) { setSupplierResults([]); return; }
    const timer = setTimeout(async () => {
      try { const r = await api.customers.getAll({ type: "proveedor", search: supplierSearch }); setSupplierResults(r.data.slice(0, 6)); } catch { }
    }, 200);
    return () => clearTimeout(timer);
  }, [supplierSearch]);

  // ── Product search ────────────────────────────────────────────
  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try { const r = await api.products.getAll({ search: productSearch }); setProductResults(r.data.slice(0, 8)); } catch { }
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // ── Select product ────────────────────────────────────────────
  const selectProduct = (p) => {
    setItemForm(prev => ({
      ...prev,
      product: p,
      package_unit: p.package_unit || prev.package_unit,
      package_size: p.package_size != null ? String(p.package_size) : prev.package_size,
      profit_margin: p.profit_margin != null ? String(p.profit_margin) : prev.profit_margin,
    }));
    setProductSearch(""); setProductResults([]);
  };

  const setIF = (key, val) => setItemForm(p => ({ ...p, [key]: val }));

  // ── Add item to receipt ───────────────────────────────────────
  const addItem = () => {
    if (!itemForm.product) return notify("Selecciona un producto", "err");
    if (!itemForm.package_size) return notify("Indica las unidades por paquete", "err");
    if (!itemForm.package_price) return notify("Indica el precio por paquete", "err");
    if (!itemForm.package_qty || parseFloat(itemForm.package_qty) <= 0)
      return notify("Cantidad de paquetes debe ser mayor a 0", "err");
    const calc = calcItem(itemForm);
    setItems(prev => [...prev, { ...itemForm, ...calc, key: Date.now() }]);
    setItemForm(prev => ({ ...EMPTY_ITEM, profit_margin: prev.profit_margin }));
  };

  const removeItem = (key) => setItems(prev => prev.filter(i => i.key !== key));

  // ── Save purchase receipt ─────────────────────────────────────
  const savePurchase = async () => {
    if (!items.length) return notify("Agrega al menos un producto", "err");
    if (!selectedWarehouseId) return notify("Selecciona el almacén destino", "err");
    setLoading(true);
    try {
      await api.purchases.create({
        supplier_id: selectedSupplier?.id || undefined,
        supplier_name: selectedSupplier?.name || undefined,
        notes: notes || undefined,
        warehouse_id: parseInt(selectedWarehouseId),   // ← NUEVO
        items: items.map(i => ({
          product_id: i.product.id,
          package_unit: i.package_unit,
          package_size: parseFloat(i.package_size),
          package_qty: parseFloat(i.package_qty),
          package_price: parseFloat(i.package_price),
          profit_margin: parseFloat(i.profit_margin) || 0,
          update_price: i.update_price,
        })),
      });
      notify("Recibo de compra registrado ✓");
      setSelectedSupplier(null); setSupplierSearch(""); setNotes(""); setItems([]);
      setItemForm(EMPTY_ITEM); setSelectedWarehouseId(warehouses.length === 1 ? String(warehouses[0].id) : "");
      await loadPurchases();
      onProductsUpdated?.();
      setView("list");
    } catch (e) { notify(e.message, "err"); }
    setLoading(false);
  };

  // ── Cancel purchase ───────────────────────────────────────────
  const cancelPurchase = async (id) => {
    if (!confirm("¿Anular esta compra? Se revertirá el stock.")) return;
    try {
      await api.purchases.remove(id);
      notify("Compra anulada, stock revertido");
      await loadPurchases(); onProductsUpdated?.();
      if (detail?.id === id) setDetail(null);
    } catch (e) { notify(e.message, "err"); }
  };

  // ── Load detail ───────────────────────────────────────────────
  const openDetail = async (p) => {
    try { const r = await api.purchases.getOne(p.id); setDetail(r.data); setView("detail"); }
    catch (e) { notify(e.message, "err"); }
  };

  const grandTotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);

  // ═══════════════════════════════════════════════════════════════
  // ── LIST VIEW
  // ═══════════════════════════════════════════════════════════════
  if (view === "list") return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <div className="text-sm text-content-muted dark:text-content-dark-muted">
          {purchases.length} recibo(s) registrado(s)
        </div>
        <button onClick={() => setView("new")} className="btn-md btn-primary">
          + Nuevo recibo de compra
        </button>
      </div>

      {purchases.length === 0
        ? <div className="text-center py-16 text-sm text-content-muted dark:text-content-dark-muted">
            Aún no hay recibos de compra.<br />
            <span className="text-xs">Registra tu primera compra para actualizar el inventario.</span>
          </div>
        : <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-warning text-warning">
                {["#", "Almacén", "Proveedor", "Productos", "Total", "Empleado", "Fecha", ""].map(h =>
                  <th key={h} className="text-left px-3 py-2.5 text-[11px] tracking-widest">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {purchases.map((p, i) => (
                <tr key={p.id} className={`border-b border-border dark:border-border-dark ${i % 2 === 0 ? "bg-surface-2 dark:bg-surface-dark-2" : ""}`}>
                  <td className="px-3 py-2.5 text-content-muted dark:text-content-dark-muted text-[11px]">#{p.id}</td>
                  <td className="px-3 py-2.5">
                    {p.warehouse_name
                      ? <span className="text-[11px] text-info border border-info/20 bg-info/5 dark:bg-info/10 px-2 py-0.5 rounded">
                          📦 {p.warehouse_name}
                        </span>
                      : <span className="text-content-muted dark:text-content-dark-muted">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-bold text-content dark:text-content-dark">
                    {p.supplier_name || <span className="text-content-muted dark:text-content-dark-muted font-normal">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-content-muted dark:text-content-dark-muted">{p.item_count} ítem(s)</td>
                  <td className="px-3 py-2.5 text-warning font-bold">${fmt2(p.total)}</td>
                  <td className="px-3 py-2.5 text-content-muted dark:text-content-dark-muted">{p.employee_name || "—"}</td>
                  <td className="px-3 py-2.5 text-[11px] text-content-muted dark:text-content-dark-muted">
                    {new Date(p.created_at).toLocaleString("es-VE")}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1.5">
                      <button onClick={() => openDetail(p)} className="btn-sm btn-ghost text-info border-info/50">Detalle</button>
                      <button onClick={() => cancelPurchase(p.id)} className="btn-sm btn-danger">Anular</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      }
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // ── DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════
  if (view === "detail" && detail) return (
    <div>
      <button
        onClick={() => { setView("list"); setDetail(null); }}
        className="btn-sm btn-ghost text-warning border-warning mb-5"
      >
        ← Volver
      </button>

      <div className="bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-md p-5 mb-5 grid grid-cols-3 gap-4">
        <div>
          <div className="text-[11px] text-content-muted dark:text-content-dark-muted tracking-widest mb-1">PROVEEDOR</div>
          <div className={`text-base font-bold ${detail.supplier_name ? "text-violet-600 dark:text-violet-400" : "text-content-muted dark:text-content-dark-muted"}`}>
            {detail.supplier_name || "—"}
          </div>
          {detail.supplier_rif && <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-0.5">{detail.supplier_rif}</div>}
          {detail.notes && <div className="text-xs text-content-muted dark:text-content-dark-muted mt-1.5">{detail.notes}</div>}
        </div>
        <div>
          <div className="text-[11px] text-content-muted dark:text-content-dark-muted tracking-widest mb-1">EMPLEADO</div>
          <div className="text-sm text-content dark:text-content-dark">{detail.employee_name || "—"}</div>
          {detail.warehouse_name && (
            <div className="text-[11px] text-info mt-1.5">📦 Almacén: <b>{detail.warehouse_name}</b></div>
          )}
          <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-1.5">
            {new Date(detail.created_at).toLocaleString("es-VE")}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-content-muted dark:text-content-dark-muted tracking-widest mb-1">TOTAL COMPRA</div>
          <div className="text-3xl font-bold text-warning">${fmt2(detail.total)}</div>
        </div>
      </div>

      <div className="text-[11px] font-bold text-warning tracking-[0.15em] mb-3">PRODUCTOS RECIBIDOS</div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border dark:border-border-dark text-content-muted dark:text-content-dark-muted">
            {["Producto", "Paquete", "Cant.", "Precio/paq.", "Costo unit.", "Margen", "P. venta", "Total uds.", "Subtotal"].map(h =>
              <th key={h} className="text-left px-2.5 py-2 text-[10px] tracking-widest">{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {detail.items.map((item, i) => (
            <tr key={item.id} className={`border-b border-border dark:border-border-dark ${i % 2 === 0 ? "bg-surface-2 dark:bg-surface-dark-2" : ""}`}>
              <td className="px-2.5 py-2.5 font-bold text-content dark:text-content-dark">{item.product_name}</td>
              <td className="px-2.5 py-2.5 text-content-muted dark:text-content-dark-muted">{item.package_unit} × {item.package_size}</td>
              <td className="px-2.5 py-2.5 text-content dark:text-content-dark">{item.package_qty}</td>
              <td className="px-2.5 py-2.5 text-info">${fmt2(item.package_price)}</td>
              <td className="px-2.5 py-2.5 text-content-muted dark:text-content-dark-muted">${fmt2(item.unit_cost)}</td>
              <td className="px-2.5 py-2.5 text-content-muted dark:text-content-dark-muted">{item.profit_margin}%</td>
              <td className="px-2.5 py-2.5 text-success font-bold">${fmt2(item.sale_price)}</td>
              <td className="px-2.5 py-2.5 text-content dark:text-content-dark">{item.total_units}</td>
              <td className="px-2.5 py-2.5 text-warning font-bold">${fmt2(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // ── NEW RECEIPT FORM
  // ═══════════════════════════════════════════════════════════════
  const calc = calcItem(itemForm);

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => setView("list")} className="btn-sm btn-secondary">← Cancelar</button>
        <div className="text-sm font-bold text-warning tracking-[0.15em]">NUEVO RECIBO DE COMPRA</div>
      </div>

      {/* ── Cabecera del recibo ── */}
      <div className="bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-md p-4 mb-4">
        <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted tracking-widest mb-3">INFORMACIÓN DEL RECIBO</div>
        <div className="grid grid-cols-3 gap-3">

          {/* ── Selector de almacén destino ── */}
          <div>
            <label className="label">Almacén destino *</label>
            {warehouses.length === 0
              ? <div className="input text-danger bg-danger/5 border-danger">
                  Sin almacenes disponibles
                </div>
              : <select
                  value={selectedWarehouseId}
                  onChange={e => setSelectedWarehouseId(e.target.value)}
                  className="input cursor-pointer"
                >
                  <option value="">— Seleccionar almacén</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
            }
            {selectedWarehouseId && (
              <div className="text-[10px] text-success mt-1">
                ● El stock entrará a <b>{warehouses.find(w => String(w.id) === selectedWarehouseId)?.name}</b>
              </div>
            )}
          </div>

          {/* Selector de proveedor */}
          <div>
            <label className="label">Proveedor</label>
            {selectedSupplier
              ? <div className="flex items-center gap-2 bg-violet-600/10 dark:bg-violet-600/10 border border-violet-600/40 rounded px-3 py-2">
                  <div className="flex-1">
                    <div className="text-sm font-bold text-violet-600 dark:text-violet-400">{selectedSupplier.name}</div>
                    {selectedSupplier.rif && <div className="text-[10px] text-content-muted dark:text-content-dark-muted">{selectedSupplier.rif}</div>}
                  </div>
                  <button
                    onClick={() => { setSelectedSupplier(null); setSupplierSearch(""); }}
                    className="btn-sm btn-danger"
                  >✕</button>
                </div>
              : <div className="relative">
                  <input
                    value={supplierSearch}
                    onChange={e => setSupplierSearch(e.target.value)}
                    placeholder="Buscar proveedor registrado..."
                    className="input"
                  />
                  {supplierSearch.trim().length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded mt-0.5 max-h-56 overflow-y-auto shadow-lg">
                      {supplierResults.map(s => (
                        <div
                          key={s.id}
                          onClick={() => { setSelectedSupplier(s); setSupplierSearch(""); setSupplierResults([]); }}
                          className="px-3 py-2.5 cursor-pointer border-b border-border dark:border-border-dark text-sm hover:bg-surface-2 dark:hover:bg-surface-dark-3"
                        >
                          <div className="font-bold text-violet-600 dark:text-violet-400">{s.name}</div>
                          <div className="text-[10px] text-content-muted dark:text-content-dark-muted">
                            {[s.rif, s.tax_name].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                          </div>
                        </div>
                      ))}
                      <div
                        onClick={() => openCreateSupplier(supplierSearch)}
                        className={`px-3 py-2.5 cursor-pointer text-sm text-violet-600 dark:text-violet-400 flex items-center gap-1.5 hover:bg-surface-2 dark:hover:bg-surface-dark-3 ${supplierResults.length > 0 ? "border-t border-border dark:border-border-dark" : ""}`}
                      >
                        <span className="text-base font-bold">+</span> Crear "{supplierSearch}"
                      </div>
                    </div>
                  )}
                </div>
            }
          </div>

          <div>
            <label className="label">Notas (opcional)</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="ej. Compra de la semana, pago contra entrega..."
              className="input"
            />
          </div>
        </div>
      </div>

      {/* ── Agregar producto ── */}
      <div className="bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-md p-4 mb-4">
        <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted tracking-widest mb-3.5">+ AGREGAR PRODUCTO AL RECIBO</div>

        {/* Búsqueda de producto */}
        <div className="mb-3.5 relative">
          <label className="label">Buscar producto</label>
          {itemForm.product
            ? <div className="flex items-center gap-2.5 bg-info/10 border border-info/40 rounded px-3 py-2">
                <div className="flex-1">
                  <div className="text-sm font-bold text-info">{itemForm.product.name}</div>
                  <div className="text-[10px] text-content-muted dark:text-content-dark-muted">
                    Stock actual: {itemForm.product.stock} {itemForm.product.unit}
                  </div>
                </div>
                <button onClick={() => setIF("product", null)} className="btn-sm btn-danger">✕ Quitar</button>
              </div>
            : <>
                <input
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Escribe para buscar un producto..."
                  className="input"
                />
                {searching && <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-1">Buscando...</div>}
                {productSearch.trim().length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded mt-0.5 max-h-56 overflow-y-auto shadow-lg">
                    {productResults.map(p => (
                      <div
                        key={p.id}
                        onClick={() => selectProduct(p)}
                        className="px-3 py-2.5 cursor-pointer border-b border-border dark:border-border-dark text-sm hover:bg-surface-2 dark:hover:bg-surface-dark-3"
                      >
                        <div className="font-bold text-content dark:text-content-dark">{p.name}</div>
                        <div className="text-[10px] text-content-muted dark:text-content-dark-muted">
                          Stock: {p.stock} {p.unit}
                          {p.package_unit && ` · Paquete: ${p.package_unit} x${p.package_size}`}
                          {p.cost_price && ` · Costo: $${fmt2(p.cost_price)}`}
                        </div>
                      </div>
                    ))}
                    <div
                      onClick={() => openCreateProduct(productSearch)}
                      className={`px-3 py-2.5 cursor-pointer text-sm text-warning flex items-center gap-1.5 hover:bg-surface-2 dark:hover:bg-surface-dark-3 ${productResults.length > 0 ? "border-t border-border dark:border-border-dark" : ""}`}
                    >
                      <span className="text-base font-bold">+</span> Crear "{productSearch}"
                    </div>
                  </div>
                )}
              </>
          }
        </div>

        {/* Detalles del paquete */}
        <div className="grid grid-cols-4 gap-2.5 mb-2.5">
          <div>
            <label className="label">Tipo de paquete</label>
            <input
              list="pkg-list"
              value={itemForm.package_unit}
              onChange={e => setIF("package_unit", e.target.value)}
              placeholder="caja, bulto..."
              className="input"
            />
            <datalist id="pkg-list">{PKG_UNITS.map(u => <option key={u} value={u} />)}</datalist>
          </div>
          <div>
            <label className="label">Unidades por paquete</label>
            <input
              type="number" min="1" step="1"
              value={itemForm.package_size}
              onChange={e => setIF("package_size", e.target.value)}
              placeholder="ej. 12"
              className="input"
            />
          </div>
          <div>
            <label className="label">Cantidad de paquetes</label>
            <input
              type="number" min="1" step="1"
              value={itemForm.package_qty}
              onChange={e => setIF("package_qty", e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Precio por paquete ($)</label>
            <input
              type="number" min="0" step="0.01"
              value={itemForm.package_price}
              onChange={e => setIF("package_price", e.target.value)}
              placeholder="0.00"
              className="input"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 mb-3.5">
          <div>
            <label className="label">Margen de ganancia (%)</label>
            <input
              type="number" min="0" step="0.1"
              value={itemForm.profit_margin}
              onChange={e => setIF("profit_margin", e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Costo unitario (calc.)</label>
            <div className={`input bg-surface-3 dark:bg-surface-dark-3 ${calc.unit_cost ? "text-info" : "text-content-muted dark:text-content-dark-muted"}`}>
              {calc.unit_cost ? `$${fmt2(calc.unit_cost)}` : "—"}
            </div>
          </div>
          <div>
            <label className="label">Precio de venta (calc.)</label>
            <div className={`input bg-surface-3 dark:bg-surface-dark-3 font-bold ${calc.sale_price ? "text-success" : "text-content-muted dark:text-content-dark-muted"}`}>
              {calc.sale_price ? `$${fmt2(calc.sale_price)}` : "—"}
            </div>
          </div>
          <div>
            <label className="label">Total unidades (calc.)</label>
            <div className={`input bg-surface-3 dark:bg-surface-dark-3 ${calc.total_units ? "text-warning" : "text-content-muted dark:text-content-dark-muted"}`}>
              {calc.total_units ? calc.total_units : "—"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 mb-3.5">
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={itemForm.update_price}
              onChange={e => setIF("update_price", e.target.checked)}
              className="w-3.5 h-3.5 accent-warning"
            />
            <span className="text-content dark:text-content-dark">Actualizar precio de venta del producto al guardar</span>
            {calc.sale_price > 0 && (
              <span className="text-success text-[11px]">→ quedará en ${fmt2(calc.sale_price)}</span>
            )}
          </label>
        </div>

        <button onClick={addItem} className="btn-sm btn-success">
          + Agregar al recibo
        </button>
      </div>

      {/* ── Items agregados ── */}
      {items.length > 0 && (
        <div className="bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-md p-4 mb-4">
          <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted tracking-widest mb-3">PRODUCTOS EN ESTE RECIBO</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border dark:border-border-dark text-content-muted dark:text-content-dark-muted">
                {["Producto", "Paquete", "Cant.", "Precio/paq.", "Costo unit.", "Margen", "P. venta", "Total uds.", "Subtotal", ""].map(h =>
                  <th key={h} className="text-left px-2 py-1.5 text-[10px] tracking-widest">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.key} className={`border-b border-border dark:border-border-dark ${i % 2 === 0 ? "bg-surface-3 dark:bg-surface-dark-3" : ""}`}>
                  <td className="px-2 py-2 font-bold text-content dark:text-content-dark">{item.product?.name}</td>
                  <td className="px-2 py-2 text-content-muted dark:text-content-dark-muted">{item.package_unit} × {item.package_size}</td>
                  <td className="px-2 py-2 text-content dark:text-content-dark">{item.package_qty}</td>
                  <td className="px-2 py-2 text-info">${fmt2(item.package_price)}</td>
                  <td className="px-2 py-2 text-content-muted dark:text-content-dark-muted">${fmt2(item.unit_cost)}</td>
                  <td className="px-2 py-2 text-content-muted dark:text-content-dark-muted">{item.profit_margin}%</td>
                  <td className="px-2 py-2 text-success font-bold">${fmt2(item.sale_price)}</td>
                  <td className="px-2 py-2 text-content dark:text-content-dark">{item.total_units}</td>
                  <td className="px-2 py-2 text-warning font-bold">${fmt2(item.subtotal)}</td>
                  <td className="px-2 py-2">
                    <button onClick={() => removeItem(item.key)} className="btn-sm btn-danger">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end items-center gap-5 mt-4 pt-3 border-t border-border dark:border-border-dark">
            <div>
              <span className="text-[11px] text-content-muted dark:text-content-dark-muted tracking-widest">TOTAL COMPRA: </span>
              <span className="text-xl font-bold text-warning">${fmt2(grandTotal)}</span>
            </div>
            <button
              onClick={savePurchase}
              disabled={loading || !selectedWarehouseId}
              className={`btn-md ${loading || !selectedWarehouseId ? "btn-secondary opacity-60 cursor-not-allowed" : "btn-primary"}`}
            >
              {loading ? "Guardando..." : !selectedWarehouseId ? "Selecciona almacén" : "Guardar recibo de compra"}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-8 text-xs text-content-muted dark:text-content-dark-muted">
          Agrega al menos un producto al recibo para poder guardarlo.
        </div>
      )}

      <CustomerModal open={supplierModal} onClose={closeSupplierModal} onSave={saveSupplier} editData={supplierEditData} loading={savingSupplier} />
      <ProductModal open={productModal} onClose={closeProductModal} onSave={saveProduct} editData={productEditData} categories={categories} loading={savingProduct} />
    </div>
  );
}
