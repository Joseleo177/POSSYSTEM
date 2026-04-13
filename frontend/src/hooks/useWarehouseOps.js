import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { useDebounce } from "./useDebounce";
import { fmtQty } from "../helpers";

const EMPTY_ADD_STOCK = { product_id: "", qty: "" };
const EMPTY_TRANSFER = { from_warehouse_id: "", to_warehouse_id: "", product_id: "", qty: "", note: "" };

/**
 * Hook para gestionar operaciones de stock y transferencias en almacenes.
 */
export function useWarehouseOps(notify, selectedWarehouse, loadWarehouses) {
  // ── Stock ──────────────────────────────────────────────────
  const [stock, setStock]               = useState([]);
  const [stockSearch, setStockSearch]   = useState("");
  const [loadingStock, setLoadingStock] = useState(false);

  // ── Editar o Eliminar Stock (Modals) ───────────────────────
  const [editStockModal, setEditStockModal]     = useState(null);
  const [deleteStockModal, setDeleteStockModal] = useState(null);
  const [editStockValue, setEditStockValue]     = useState("");

  // ── Agregar producto al almacén manualmente ────────────────
  const [addStockModal, setAddStockModal]   = useState(false);
  const [addStockForm, setAddStockForm]     = useState(EMPTY_ADD_STOCK);
  const [addStockSearch, setAddStockSearch] = useState("");
  const debouncedAddStockSearch             = useDebounce(addStockSearch, 250);
  const [addStockResults, setAddStockResults] = useState([]);
  const [addStockProduct, setAddStockProduct] = useState(null);
  const [savingStock, setSavingStock]       = useState(false);

  // ── Transferencias ─────────────────────────────────────────
  const [transfers, setTransfers]     = useState([]);
  const [transferProductSearch, setTransferProductSearch] = useState("");
  const debouncedTransferProductSearch = useDebounce(transferProductSearch, 250);
  const [transferProductResults, setTransferProductResults] = useState([]);
  const [transferProductSelected, setTransferProductSelected] = useState(null);
  const [transferForm, setTransferForm] = useState(EMPTY_TRANSFER);
  const [loadingTransfer, setLoadingTransfer] = useState(false);
  const [transferModal, setTransferModal]     = useState(false);

  // ── Loaders ────────────────────────────────────────────────
  const loadStock = useCallback(async (warehouseId) => {
    if (!warehouseId) return;
    setLoadingStock(true);
    try {
      const r = await api.warehouses.getStock(warehouseId);
      setStock(r.data);
    } catch (e) { notify(e.message, "err"); }
    finally { setLoadingStock(false); }
  }, [notify]);

  const loadTransfers = useCallback(async () => {
    try {
      const r = await api.warehouses.getTransfers({ limit: 100 });
      setTransfers(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [notify]);

  // ── Effects ────────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedTransferProductSearch.trim()) { setTransferProductResults([]); return; }
    api.products.getAll({ search: debouncedTransferProductSearch, is_combo: false, is_service: false, limit: 10 })
      .then(r => setTransferProductResults(r.data))
      .catch(() => {});
  }, [debouncedTransferProductSearch]);

  useEffect(() => {
    if (!debouncedAddStockSearch.trim()) { setAddStockResults([]); return; }
    async function searchItems() {
      try {
        const r = await api.products.getAll({ search: debouncedAddStockSearch, is_service: false });
        setAddStockResults(r.data.slice(0, 8));
      } catch {}
    }
    searchItems();
  }, [debouncedAddStockSearch]);

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

  const clearAddStockProduct = useCallback(() => {
    setAddStockProduct(null);
    setAddStockForm(EMPTY_ADD_STOCK);
  }, []);

  const doAddStock = async () => {
    if (!selectedWarehouse) return notify("No hay almacén seleccionado", "err");
    if (!addStockProduct) return notify("Selecciona un producto", "err");
    if (!addStockForm.qty && addStockForm.qty !== 0) return notify("Ingresa la cantidad", "err");
    setSavingStock(true);
    try {
      await api.warehouses.addStock(selectedWarehouse.id, {
        product_id: addStockProduct.id,
        qty: parseFloat(addStockForm.qty) || 0,
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
    const { from_warehouse_id, to_warehouse_id, qty, note } = transferForm;
    const product_id = transferProductSelected?.id;
    if (!from_warehouse_id || !to_warehouse_id || !product_id || !qty)
      return notify("Origen, destino, producto y cantidad son requeridos", "err");
    setLoadingTransfer(true);
    try {
      await api.warehouses.transfer({
        from_warehouse_id: parseInt(from_warehouse_id),
        to_warehouse_id: parseInt(to_warehouse_id),
        product_id,
        qty: parseFloat(qty),
        note: note || null,
      });
      notify("Transferencia registrada ✓");
      setTransferForm(EMPTY_TRANSFER);
      setTransferProductSearch("");
      setTransferProductResults([]);
      setTransferProductSelected(null);
      setTransferModal(false);
      await loadTransfers();
      await loadWarehouses();
    } catch (e) { notify(e.message, "err"); }
    finally { setLoadingTransfer(false); }
  };

  // ── Editar o Eliminar Stock manualmente ──────────────────────
  const handleEditStock = (item) => {
    if (item.is_combo) {
      notify("El stock de un combo es calculado automáticamente.", "warning");
      return;
    }
    setEditStockValue(fmtQty(item.qty));
    setEditStockModal(item);
  };

  const submitEditStock = async (e) => {
    if (e) e.preventDefault();
    if (!editStockModal || !selectedWarehouse) return;
    const qty = parseFloat(editStockValue);
    if (isNaN(qty) || qty < 0) return notify("Cantidad inválida", "err");

    try {
      await api.warehouses.setStock(selectedWarehouse.id, editStockModal.product_id, { qty });
      notify("Stock actualizado ✓");
      loadStock(selectedWarehouse.id);
      setEditStockModal(null);
    } catch (err) { notify(err.message, "err"); }
  };

  const handleDeleteStock = (item) => setDeleteStockModal(item);

  const confirmDeleteStock = async () => {
    if (!deleteStockModal || !selectedWarehouse) return;
    try {
      await api.warehouses.removeStock(selectedWarehouse.id, deleteStockModal.product_id);
      notify("Producto retirado del almacén ✓");
      loadStock(selectedWarehouse.id);
      setDeleteStockModal(null);
    } catch (err) { notify(err.message, "err"); }
  };

  // ── Stock filtrado ─────────────────────────────────────────
  const filteredStock = stock.filter(s =>
    !s.is_service && (
      !stockSearch ||
      s.product_name.toLowerCase().includes(stockSearch.toLowerCase()) ||
      (s.category_name || "").toLowerCase().includes(stockSearch.toLowerCase())
    )
  );

  return {
    // Stock
    stock, loadStock, loadingStock,
    stockSearch, setStockSearch,
    filteredStock,
    // CRUD Stock Modals
    editStockModal, setEditStockModal, editStockValue, setEditStockValue, handleEditStock, submitEditStock,
    deleteStockModal, setDeleteStockModal, handleDeleteStock, confirmDeleteStock,
    // Add Stock
    addStockModal, setAddStockModal, openAddStock,
    addStockForm, setAddStockForm, addStockSearch, setAddStockSearch, addStockResults,
    addStockProduct, selectAddStockProduct, clearAddStockProduct, doAddStock, savingStock,
    // Transfers
    transfers, loadTransfers,
    transferProductSearch, setTransferProductSearch,
    transferProductResults, setTransferProductResults,
    transferProductSelected, setTransferProductSelected,
    transferForm, setTransferForm, transferModal, setTransferModal, loadingTransfer, doTransfer,
    EMPTY_TRANSFER
  };
}
