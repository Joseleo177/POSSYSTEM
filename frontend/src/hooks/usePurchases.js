import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { calcPurchaseItem } from "../helpers";

const EMPTY_ITEM = {
  product: null,
  package_unit: "",
  package_size: "",
  package_qty: 1,
  package_price: "",
  profit_margin: 30,
  update_price: true,
};

/**
 * Gestiona el estado y operaciones del módulo de compras.
 *
 * @param {function} notify - Función de notificación de AppContext
 * @param {function} [onProductsUpdated] - Callback tras guardar una compra
 */
export function usePurchases(notify, onProductsUpdated) {
  const [view, setView]         = useState("list"); // list | new | detail
  const [purchases, setPurchases] = useState([]);
  const [detail, setDetail]     = useState(null);
  const [loading, setLoading]   = useState(false);

  // ── Almacenes ─────────────────────────────────────────────────
  const [warehouses, setWarehouses]               = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");

  // ── Formulario nueva compra ───────────────────────────────────
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [notes, setNotes]                       = useState("");
  const [items, setItems]                       = useState([]);
  const [itemForm, setItemForm]                 = useState(EMPTY_ITEM);

  // ── Loaders ───────────────────────────────────────────────────
  const loadPurchases = useCallback(async () => {
    try {
      const r = await api.purchases.getAll();
      setPurchases(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [notify]);

  const loadWarehouses = useCallback(async () => {
    try {
      const r = await api.warehouses.getAll();
      const active = r.data.filter(w => w.active);
      setWarehouses(active);
      if (active.length === 1) setSelectedWarehouseId(String(active[0].id));
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadPurchases(); loadWarehouses(); }, [loadPurchases, loadWarehouses]);

  // ── Manejo de ítems ───────────────────────────────────────────
  const setIF = useCallback((key, val) => setItemForm(p => {
    const newState = { ...p, [key]: val };
    if (key === "package_unit" && val && val.toLowerCase() === "unidad") {
      newState.package_size = "1";
    }
    return newState;
  }), []);

  const selectProduct = useCallback((p) => {
    setItemForm(prev => {
      const pkgUnit = p.package_unit || prev.package_unit || "unidad";
      return {
        ...prev,
        product: p,
        package_unit: pkgUnit,
        package_size: pkgUnit.toLowerCase() === "unidad" ? "1" : (p.package_size != null ? String(p.package_size) : prev.package_size),
        profit_margin: p.profit_margin != null ? String(p.profit_margin) : prev.profit_margin,
      };
    });
  }, []);

  const addItem = useCallback(() => {
    if (!itemForm.product)       { notify("Selecciona un producto", "err"); return; }
    if (!itemForm.package_size)  { notify("Indica las unidades por paquete", "err"); return; }
    if (!itemForm.package_price) { notify("Indica el precio por paquete", "err"); return; }
    if (!itemForm.package_qty || parseFloat(itemForm.package_qty) <= 0) {
      notify("Cantidad de paquetes debe ser mayor a 0", "err"); return;
    }
    const calc = calcPurchaseItem(itemForm);
    setItems(prev => [...prev, { ...itemForm, ...calc, key: Date.now() }]);
    setItemForm(prev => ({ ...EMPTY_ITEM, profit_margin: prev.profit_margin }));
  }, [itemForm, notify]);

  const removeItem = useCallback((key) =>
    setItems(prev => prev.filter(i => i.key !== key))
  , []);

  // ── Guardar compra ────────────────────────────────────────────
  const savePurchase = useCallback(async (supplierData) => {
    if (!items.length)           { notify("Agrega al menos un producto", "err"); return; }
    if (!selectedWarehouseId)    { notify("Selecciona el almacén destino", "err"); return; }
    setLoading(true);
    try {
      await api.purchases.create({
        supplier_id:   supplierData?.id   || undefined,
        supplier_name: supplierData?.name || undefined,
        notes:         notes              || undefined,
        warehouse_id:  parseInt(selectedWarehouseId),
        items: items.map(i => ({
          product_id:    i.product.id,
          package_unit:  i.package_unit,
          package_size:  parseFloat(i.package_size),
          package_qty:   parseFloat(i.package_qty),
          package_price: parseFloat(i.package_price),
          profit_margin: parseFloat(i.profit_margin),
          update_price:  i.update_price,
        })),
      });
      notify("Compra registrada ✓");
      setItems([]);
      setSelectedSupplier(null);
      setNotes("");
      setItemForm(EMPTY_ITEM);
      setView("list");
      await loadPurchases();
      onProductsUpdated?.();
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  }, [items, selectedWarehouseId, notes, notify, loadPurchases, onProductsUpdated]);

  const cancelPurchase = useCallback(async (id) => {
    try {
      await api.purchases.cancel(id);
      notify("Compra anulada ✓");
      loadPurchases();
    } catch (e) { notify(e.message, "err"); }
  }, [notify, loadPurchases]);

  const openDetail = useCallback(async (id) => {
    try {
      const r = await api.purchases.getOne(id);
      setDetail(r.data);
      setView("detail");
    } catch (e) { notify(e.message, "err"); }
  }, [notify]);

  const resetForm = useCallback(() => {
    setSelectedSupplier(null);
    setNotes("");
    setItems([]);
    setItemForm(EMPTY_ITEM);
  }, []);

  return {
    // Vistas
    view, setView,
    // Lista
    purchases, loadPurchases,
    // Detalle
    detail, openDetail,
    // Almacenes
    warehouses, selectedWarehouseId, setSelectedWarehouseId,
    // Formulario
    selectedSupplier, setSelectedSupplier,
    notes, setNotes,
    items,
    itemForm, setIF, selectProduct,
    // Ítems
    addItem, removeItem,
    // Acciones
    loading, savePurchase, cancelPurchase, resetForm,
    // Constantes
    EMPTY_ITEM,
  };
}
