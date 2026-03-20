import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import CustomerModal from "./CustomerModal";
import ProductModal from "./ProductModal";

const inp = {
  width: "100%", background: "#0f0f0f", border: "1px solid #333",
  color: "#e8e0d0", padding: "8px 10px", borderRadius: 4,
  fontFamily: "inherit", fontSize: 13, boxSizing: "border-box",
};
const btnSmall = {
  background: "transparent", color: "#888", border: "1px solid #333",
  padding: "4px 10px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 11,
};
const label11 = { fontSize: 11, color: "#888", marginBottom: 4, display: "block" };
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "#555" }}>{purchases.length} recibo(s) registrado(s)</div>
        <button onClick={() => setView("new")}
          style={{ background: "#f0a500", color: "#0f0f0f", border: "none", padding: "10px 20px", borderRadius: 4, fontFamily: "inherit", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
          + Nuevo recibo de compra
        </button>
      </div>
      {purchases.length === 0
        ? <div style={{ textAlign: "center", color: "#444", padding: "60px 0", fontSize: 13 }}>
          Aún no hay recibos de compra.<br />
          <span style={{ color: "#555", fontSize: 11 }}>Registra tu primera compra para actualizar el inventario.</span>
        </div>
        : <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #f0a500", color: "#f0a500" }}>
              {["#", "Almacén", "Proveedor", "Productos", "Total", "Empleado", "Fecha", ""].map(h =>
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, letterSpacing: 1 }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {purchases.map((p, i) => (
              <tr key={p.id} style={{ background: i % 2 === 0 ? "#111" : "transparent", borderBottom: "1px solid #1e1e1e" }}>
                <td style={{ padding: "10px 12px", color: "#555", fontSize: 11 }}>#{p.id}</td>
                <td style={{ padding: "10px 12px" }}>
                  {p.warehouse_name
                    ? <span style={{ fontSize: 11, color: "#5dade2", border: "1px solid #2980b933", background: "#0d1f2b", padding: "2px 8px", borderRadius: 3 }}>📦 {p.warehouse_name}</span>
                    : <span style={{ color: "#444" }}>—</span>}
                </td>
                <td style={{ padding: "10px 12px", fontWeight: "bold" }}>{p.supplier_name || <span style={{ color: "#444" }}>—</span>}</td>
                <td style={{ padding: "10px 12px", color: "#888" }}>{p.item_count} ítem(s)</td>
                <td style={{ padding: "10px 12px", color: "#f0a500", fontWeight: "bold" }}>${fmt2(p.total)}</td>
                <td style={{ padding: "10px 12px", color: "#888" }}>{p.employee_name || "—"}</td>
                <td style={{ padding: "10px 12px", color: "#555", fontSize: 11 }}>{new Date(p.created_at).toLocaleString("es-VE")}</td>
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openDetail(p)} style={{ ...btnSmall, color: "#5dade2", borderColor: "#2980b9" }}>Detalle</button>
                    <button onClick={() => cancelPurchase(p.id)} style={{ ...btnSmall, color: "#e74c3c", borderColor: "#e74c3c" }}>Anular</button>
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
      <button onClick={() => { setView("list"); setDetail(null); }}
        style={{ ...btnSmall, marginBottom: 20, padding: "7px 16px", fontSize: 12, color: "#f0a500", borderColor: "#f0a500" }}>
        ← Volver
      </button>
      <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>PROVEEDOR</div>
          <div style={{ fontSize: 16, fontWeight: "bold", color: detail.supplier_name ? "#9b59b6" : "#444" }}>{detail.supplier_name || "—"}</div>
          {detail.supplier_rif && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{detail.supplier_rif}</div>}
          {detail.notes && <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>{detail.notes}</div>}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>EMPLEADO</div>
          <div style={{ fontSize: 13 }}>{detail.employee_name || "—"}</div>
          {detail.warehouse_name && (
            <div style={{ fontSize: 11, color: "#5dade2", marginTop: 6 }}>📦 Almacén: <b>{detail.warehouse_name}</b></div>
          )}
          <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>{new Date(detail.created_at).toLocaleString("es-VE")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>TOTAL COMPRA</div>
          <div style={{ fontSize: 28, fontWeight: "bold", color: "#f0a500" }}>${fmt2(detail.total)}</div>
        </div>
      </div>
      <div style={{ fontWeight: "bold", fontSize: 11, color: "#f0a500", letterSpacing: 2, marginBottom: 12 }}>PRODUCTOS RECIBIDOS</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2a2a", color: "#555" }}>
            {["Producto", "Paquete", "Cant.", "Precio/paq.", "Costo unit.", "Margen", "P. venta", "Total uds.", "Subtotal"].map(h =>
              <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, letterSpacing: 1 }}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {detail.items.map((item, i) => (
            <tr key={item.id} style={{ background: i % 2 === 0 ? "#111" : "transparent", borderBottom: "1px solid #1a1a1a" }}>
              <td style={{ padding: "10px 10px", fontWeight: "bold" }}>{item.product_name}</td>
              <td style={{ padding: "10px 10px", color: "#888" }}>{item.package_unit} × {item.package_size}</td>
              <td style={{ padding: "10px 10px" }}>{item.package_qty}</td>
              <td style={{ padding: "10px 10px", color: "#5dade2" }}>${fmt2(item.package_price)}</td>
              <td style={{ padding: "10px 10px", color: "#888" }}>${fmt2(item.unit_cost)}</td>
              <td style={{ padding: "10px 10px", color: "#888" }}>{item.profit_margin}%</td>
              <td style={{ padding: "10px 10px", color: "#27ae60", fontWeight: "bold" }}>${fmt2(item.sale_price)}</td>
              <td style={{ padding: "10px 10px", color: "#aaa" }}>{item.total_units}</td>
              <td style={{ padding: "10px 10px", color: "#f0a500", fontWeight: "bold" }}>${fmt2(item.subtotal)}</td>
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => setView("list")} style={{ ...btnSmall, padding: "7px 16px", fontSize: 12, color: "#888", borderColor: "#444" }}>← Cancelar</button>
        <div style={{ fontSize: 14, fontWeight: "bold", color: "#f0a500", letterSpacing: 2 }}>NUEVO RECIBO DE COMPRA</div>
      </div>

      {/* ── Cabecera del recibo ── */}
      <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: "bold", fontSize: 11, color: "#555", letterSpacing: 2, marginBottom: 12 }}>INFORMACIÓN DEL RECIBO</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

          {/* ── Selector de almacén destino ── */}
          <div>
            <span style={label11}>Almacén destino *</span>
            {warehouses.length === 0
              ? <div style={{ ...inp, color: "#e74c3c", background: "#1a0000", border: "1px solid #e74c3c" }}>
                Sin almacenes disponibles
              </div>
              : <select value={selectedWarehouseId} onChange={e => setSelectedWarehouseId(e.target.value)}
                style={{ ...inp, cursor: "pointer" }}>
                <option value="">— Seleccionar almacén</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            }
            {selectedWarehouseId && (
              <div style={{ fontSize: 10, color: "#27ae60", marginTop: 4 }}>
                ● El stock entrará a <b>{warehouses.find(w => String(w.id) === selectedWarehouseId)?.name}</b>
              </div>
            )}
          </div>

          {/* Selector de proveedor */}
          <div>
            <span style={label11}>Proveedor</span>
            {selectedSupplier
              ? <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0d1f2b", border: "1px solid #8e44ad", borderRadius: 4, padding: "8px 12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: "bold", color: "#9b59b6" }}>{selectedSupplier.name}</div>
                  {selectedSupplier.rif && <div style={{ fontSize: 10, color: "#555" }}>{selectedSupplier.rif}</div>}
                </div>
                <button onClick={() => { setSelectedSupplier(null); setSupplierSearch(""); }} style={{ ...btnSmall, color: "#e74c3c", borderColor: "#e74c3c" }}>✕</button>
              </div>
              : <div style={{ position: "relative" }}>
                <input value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)}
                  placeholder="Buscar proveedor registrado..." style={inp} />
                {supplierSearch.trim().length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1e1e1e", border: "1px solid #333", borderRadius: 4, zIndex: 20, maxHeight: 220, overflowY: "auto" }}>
                    {supplierResults.map(s => (
                      <div key={s.id} onClick={() => { setSelectedSupplier(s); setSupplierSearch(""); setSupplierResults([]); }}
                        style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #222", fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = "#2a2a2a"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ fontWeight: "bold", color: "#9b59b6" }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: "#555" }}>{[s.rif, s.tax_name].filter(Boolean).join(" · ") || "Sin datos adicionales"}</div>
                      </div>
                    ))}
                    <div onClick={() => openCreateSupplier(supplierSearch)}
                      style={{ padding: "10px 12px", cursor: "pointer", fontSize: 13, color: "#8e44ad", borderTop: supplierResults.length > 0 ? "1px solid #2a2a2a" : "none", display: "flex", alignItems: "center", gap: 6 }}
                      onMouseEnter={e => e.currentTarget.style.background = "#1a0d2b"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <span style={{ fontSize: 15, fontWeight: "bold" }}>+</span> Crear "{supplierSearch}"
                    </div>
                  </div>
                )}
              </div>
            }
          </div>

          <div>
            <span style={label11}>Notas (opcional)</span>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="ej. Compra de la semana, pago contra entrega..." style={inp} />
          </div>
        </div>
      </div>

      {/* ── Agregar producto ── */}
      <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: "bold", fontSize: 11, color: "#555", letterSpacing: 2, marginBottom: 14 }}>+ AGREGAR PRODUCTO AL RECIBO</div>

        {/* Búsqueda de producto */}
        <div style={{ marginBottom: 14, position: "relative" }}>
          <span style={label11}>Buscar producto</span>
          {itemForm.product
            ? <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d1f2b", border: "1px solid #2980b9", borderRadius: 4, padding: "8px 12px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: "bold", color: "#5dade2" }}>{itemForm.product.name}</div>
                <div style={{ fontSize: 10, color: "#555" }}>Stock actual: {itemForm.product.stock} {itemForm.product.unit}</div>
              </div>
              <button onClick={() => setIF("product", null)} style={{ ...btnSmall, color: "#e74c3c", borderColor: "#e74c3c" }}>✕ Quitar</button>
            </div>
            : <>
              <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
                placeholder="Escribe para buscar un producto..." style={inp} />
              {searching && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>Buscando...</div>}
              {productSearch.trim().length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1e1e1e", border: "1px solid #333", borderRadius: 4, zIndex: 10, maxHeight: 220, overflowY: "auto" }}>
                  {productResults.map(p => (
                    <div key={p.id} onClick={() => selectProduct(p)}
                      style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #222", fontSize: 13 }}
                      onMouseEnter={e => e.currentTarget.style.background = "#2a2a2a"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ fontWeight: "bold" }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: "#555" }}>
                        Stock: {p.stock} {p.unit}
                        {p.package_unit && ` · Paquete: ${p.package_unit} x${p.package_size}`}
                        {p.cost_price && ` · Costo: $${fmt2(p.cost_price)}`}
                      </div>
                    </div>
                  ))}
                  <div onClick={() => openCreateProduct(productSearch)}
                    style={{ padding: "10px 12px", cursor: "pointer", fontSize: 13, color: "#f0a500", borderTop: productResults.length > 0 ? "1px solid #2a2a2a" : "none", display: "flex", alignItems: "center", gap: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background = "#1a1500"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontSize: 15, fontWeight: "bold" }}>+</span> Crear "{productSearch}"
                  </div>
                </div>
              )}
            </>
          }
        </div>

        {/* Detalles del paquete */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <span style={label11}>Tipo de paquete</span>
            <input list="pkg-list" value={itemForm.package_unit} onChange={e => setIF("package_unit", e.target.value)}
              placeholder="caja, bulto..." style={inp} />
            <datalist id="pkg-list">{PKG_UNITS.map(u => <option key={u} value={u} />)}</datalist>
          </div>
          <div>
            <span style={label11}>Unidades por paquete</span>
            <input type="number" min="1" step="1" value={itemForm.package_size}
              onChange={e => setIF("package_size", e.target.value)} placeholder="ej. 12" style={inp} />
          </div>
          <div>
            <span style={label11}>Cantidad de paquetes</span>
            <input type="number" min="1" step="1" value={itemForm.package_qty}
              onChange={e => setIF("package_qty", e.target.value)} style={inp} />
          </div>
          <div>
            <span style={label11}>Precio por paquete ($)</span>
            <input type="number" min="0" step="0.01" value={itemForm.package_price}
              onChange={e => setIF("package_price", e.target.value)} placeholder="0.00" style={inp} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <span style={label11}>Margen de ganancia (%)</span>
            <input type="number" min="0" step="0.1" value={itemForm.profit_margin}
              onChange={e => setIF("profit_margin", e.target.value)} style={inp} />
          </div>
          <div>
            <span style={label11}>Costo unitario (calc.)</span>
            <div style={{ ...inp, color: calc.unit_cost ? "#5dade2" : "#333", background: "#080808" }}>
              {calc.unit_cost ? `$${fmt2(calc.unit_cost)}` : "—"}
            </div>
          </div>
          <div>
            <span style={label11}>Precio de venta (calc.)</span>
            <div style={{ ...inp, color: calc.sale_price ? "#27ae60" : "#333", background: "#080808", fontWeight: "bold" }}>
              {calc.sale_price ? `$${fmt2(calc.sale_price)}` : "—"}
            </div>
          </div>
          <div>
            <span style={label11}>Total unidades (calc.)</span>
            <div style={{ ...inp, color: calc.total_units ? "#f0a500" : "#333", background: "#080808" }}>
              {calc.total_units ? calc.total_units : "—"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12 }}>
            <input type="checkbox" checked={itemForm.update_price} onChange={e => setIF("update_price", e.target.checked)}
              style={{ width: 14, height: 14, accentColor: "#f0a500" }} />
            <span style={{ color: "#aaa" }}>Actualizar precio de venta del producto al guardar</span>
            {calc.sale_price > 0 && <span style={{ color: "#27ae60", fontSize: 11 }}>→ quedará en ${fmt2(calc.sale_price)}</span>}
          </label>
        </div>

        <button onClick={addItem}
          style={{ background: "#1e3a1e", color: "#27ae60", border: "1px solid #27ae60", padding: "8px 20px", borderRadius: 4, fontFamily: "inherit", fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>
          + Agregar al recibo
        </button>
      </div>

      {/* ── Items agregados ── */}
      {items.length > 0 && (
        <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: "bold", fontSize: 11, color: "#555", letterSpacing: 2, marginBottom: 12 }}>PRODUCTOS EN ESTE RECIBO</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2a2a2a", color: "#555" }}>
                {["Producto", "Paquete", "Cant.", "Precio/paq.", "Costo unit.", "Margen", "P. venta", "Total uds.", "Subtotal", ""].map(h =>
                  <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, letterSpacing: 1 }}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.key} style={{ background: i % 2 === 0 ? "#111" : "transparent", borderBottom: "1px solid #1a1a1a" }}>
                  <td style={{ padding: "8px 8px", fontWeight: "bold" }}>{item.product?.name}</td>
                  <td style={{ padding: "8px 8px", color: "#888" }}>{item.package_unit} × {item.package_size}</td>
                  <td style={{ padding: "8px 8px" }}>{item.package_qty}</td>
                  <td style={{ padding: "8px 8px", color: "#5dade2" }}>${fmt2(item.package_price)}</td>
                  <td style={{ padding: "8px 8px", color: "#888" }}>${fmt2(item.unit_cost)}</td>
                  <td style={{ padding: "8px 8px", color: "#888" }}>{item.profit_margin}%</td>
                  <td style={{ padding: "8px 8px", color: "#27ae60", fontWeight: "bold" }}>${fmt2(item.sale_price)}</td>
                  <td style={{ padding: "8px 8px", color: "#aaa" }}>{item.total_units}</td>
                  <td style={{ padding: "8px 8px", color: "#f0a500", fontWeight: "bold" }}>${fmt2(item.subtotal)}</td>
                  <td style={{ padding: "8px 8px" }}>
                    <button onClick={() => removeItem(item.key)} style={{ ...btnSmall, color: "#e74c3c", borderColor: "#e74c3c" }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 20, marginTop: 16, paddingTop: 12, borderTop: "1px solid #2a2a2a" }}>
            <div>
              <span style={{ fontSize: 11, color: "#555", letterSpacing: 1 }}>TOTAL COMPRA: </span>
              <span style={{ fontSize: 20, fontWeight: "bold", color: "#f0a500" }}>${fmt2(grandTotal)}</span>
            </div>
            <button onClick={savePurchase} disabled={loading || !selectedWarehouseId}
              style={{ background: loading || !selectedWarehouseId ? "#7a5200" : "#f0a500", color: "#0f0f0f", border: "none", padding: "10px 28px", borderRadius: 4, fontFamily: "inherit", fontWeight: "bold", cursor: loading || !selectedWarehouseId ? "not-allowed" : "pointer", fontSize: 14 }}>
              {loading ? "Guardando..." : !selectedWarehouseId ? "Selecciona almacén" : "Guardar recibo de compra"}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div style={{ textAlign: "center", color: "#444", padding: "30px 0", fontSize: 12 }}>
          Agrega al menos un producto al recibo para poder guardarlo.
        </div>
      )}

      <CustomerModal open={supplierModal} onClose={closeSupplierModal} onSave={saveSupplier} editData={supplierEditData} loading={savingSupplier} />
      <ProductModal open={productModal} onClose={closeProductModal} onSave={saveProduct} editData={productEditData} categories={categories} loading={savingProduct} />
    </div>
  );
}