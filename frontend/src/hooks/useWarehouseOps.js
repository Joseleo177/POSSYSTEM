import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../services/api";
import { useDebounce } from "./useDebounce";
import { fmtQty } from "../helpers";
import { isIntegerUnit } from "../helpers/unitFormatter";

const EMPTY_ADD_STOCK = { product_id: "", qty: "" };
const EMPTY_TRANSFER = { from_warehouse_id: "", to_warehouse_id: "", product_id: "", qty: "", note: "" };

/**
 * Hook para gestionar operaciones de stock y transferencias en almacenes.
 */
export function useWarehouseOps(notify, selectedWarehouse, loadWarehouses) {
  // ── Stock ──────────────────────────────────────────────────
  const [stock, setStock]               = useState([]);
  const [stockSearch, setStockSearch]   = useState("");
  const debouncedStockSearch            = useDebounce(stockSearch, 250);
  const [loadingStock, setLoadingStock] = useState(false);
  // Ref con el último término debounced para que loadStock mantenga
  // identidad estable y no dispare efectos en cadena al teclear.
  const searchRef = useRef("");
  useEffect(() => { searchRef.current = debouncedStockSearch; }, [debouncedStockSearch]);
  const [stockPage, setStockPage]       = useState(1);
  const [totalStockItems, setTotalStockItems] = useState(0);
  const stockLimit = 50;

  // ── Editar o Eliminar Stock (Modals) ───────────────────────
  const [editStockModal, setEditStockModal]     = useState(null);
  const [deleteStockModal, setDeleteStockModal] = useState(null);
  const [editStockValue, setEditStockValue]     = useState("");

  // ── Agregar producto al almacén manualmente ────────────────
  const [addStockModal, setAddStockModal]   = useState(false);
  const [addStockForm, setAddStockForm]     = useState(EMPTY_ADD_STOCK);
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
  // Paginación por scroll infinito del buscador de productos a transferir
  const TRANSFER_PAGE = 30;
  const [transferProductTotal, setTransferProductTotal] = useState(0);
  const [loadingTransferProducts, setLoadingTransferProducts] = useState(false);
  const [loadingMoreTransferProducts, setLoadingMoreTransferProducts] = useState(false);
  const transferOffsetRef = useRef(0);
  const transferReqRef    = useRef(0);
  const transferSearchRef = useRef("");
  const transferFromRef   = useRef("");
  useEffect(() => { transferSearchRef.current = debouncedTransferProductSearch; }, [debouncedTransferProductSearch]);
  useEffect(() => { transferFromRef.current = transferForm.from_warehouse_id; }, [transferForm.from_warehouse_id]);

  // ── Loaders ────────────────────────────────────────────────
  // Identidad estable: lee el término de búsqueda desde el ref para que
  // los consumidores con loadStock en dependencias no se re-disparen.
  const loadStock = useCallback(async (warehouseId, p = 1) => {
    if (!warehouseId) return;
    setLoadingStock(true);
    setStockPage(p);
    try {
      const q = {
        limit: stockLimit,
        offset: (p - 1) * stockLimit,
        search: (searchRef.current || "").trim(),
      };
      const r = await api.warehouses.getStock(warehouseId, q);
      setStock(r.data || []);
      setTotalStockItems(r.total || 0);
    } catch (e) { notify(e.message, "err"); }
    finally { setLoadingStock(false); }
  }, [notify, stockLimit]);

  const loadTransfers = useCallback(async () => {
    try {
      const r = await api.warehouses.getTransfers({ limit: 100 });
      setTransfers(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [notify]);

  // ── Effects ────────────────────────────────────────────────
  // El cambio de almacén lo maneja WarehousesTab (evita doble fetch).
  // Aquí sólo refrescamos cuando cambia la búsqueda debounceada.
  useEffect(() => {
    if (selectedWarehouse) loadStock(selectedWarehouse.id, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedStockSearch]);
  // Carga una página de productos a transferir. append=false reinicia; append=true suma (scroll infinito).
  // Con almacén de origen → solo productos con stock ahí; sin origen → todos los productos simples.
  const loadTransferProducts = useCallback(async (append = false) => {
    const off   = append ? transferOffsetRef.current : 0;
    const myReq = append ? transferReqRef.current : ++transferReqRef.current;
    if (append) setLoadingMoreTransferProducts(true); else setLoadingTransferProducts(true);
    try {
      const fromId = transferFromRef.current;
      const params = { search: (transferSearchRef.current || "").trim(), limit: TRANSFER_PAGE, offset: off };
      const r = fromId
        ? await api.warehouses.getProducts(fromId, { ...params, simple_only: true })
        : await api.products.getAll({ ...params, is_combo: false, is_service: false });
      if (myReq !== transferReqRef.current) return; // resultado obsoleto
      const data = r.data || [];
      setTransferProductTotal(r.total ?? data.length);
      transferOffsetRef.current = off + data.length;
      setTransferProductResults(prev => append ? [...prev, ...data] : data);
    } catch {
      if (myReq === transferReqRef.current && !append) { setTransferProductResults([]); setTransferProductTotal(0); }
    } finally {
      if (myReq === transferReqRef.current) { if (append) setLoadingMoreTransferProducts(false); else setLoadingTransferProducts(false); }
    }
  }, []);

  const loadMoreTransferProducts = useCallback(() => { loadTransferProducts(true); }, [loadTransferProducts]);

  // Recarga desde cero al abrir el modal, buscar, o cambiar el almacén de origen
  useEffect(() => {
    if (!transferModal) return;
    transferOffsetRef.current = 0;
    loadTransferProducts(false);
  }, [transferModal, debouncedTransferProductSearch, transferForm.from_warehouse_id, loadTransferProducts]);



  // ── Agregar producto manualmente ───────────────────────────
  const openAddStock = () => {
    setAddStockProduct(null);
    setAddStockForm(EMPTY_ADD_STOCK);
    setAddStockModal(true);
  };

  const selectAddStockProduct = (p) => {
    setAddStockProduct(p);
    setAddStockForm(prev => ({ ...prev, product_id: p.id }));
  };

  const clearAddStockProduct = useCallback(() => {
    setAddStockProduct(null);
    setAddStockForm(EMPTY_ADD_STOCK);
  }, []);

  const doAddStock = async () => {
    if (!selectedWarehouse) return notify("No hay almacén seleccionado", "err");
    if (!addStockProduct) return notify("Selecciona un producto", "err");
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
      setTransferForm({ ...EMPTY_TRANSFER });
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
    let qty = parseFloat(editStockValue);
    if (isNaN(qty) || qty < 0) return notify("Cantidad inválida", "err");
    // Unidades contables (UNIDAD) → sin decimales
    if (isIntegerUnit(editStockModal.unit)) qty = Math.floor(qty);

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
  const filteredStock = stock;

  return {
    // Stock
    stock, loadStock, loadingStock,
    stockSearch, setStockSearch,
    filteredStock, stockPage, setStockPage, totalStockItems, stockLimit,
    // CRUD Stock Modals
    editStockModal, setEditStockModal, editStockValue, setEditStockValue, handleEditStock, submitEditStock,
    deleteStockModal, setDeleteStockModal, handleDeleteStock, confirmDeleteStock,
    // Add Stock
    addStockModal, setAddStockModal, openAddStock,
    addStockForm, setAddStockForm,
    addStockProduct, selectAddStockProduct, clearAddStockProduct, doAddStock, savingStock,
    // Transfers
    transfers, loadTransfers,
    transferProductSearch, setTransferProductSearch,
    transferProductResults, setTransferProductResults,
    transferProductSelected, setTransferProductSelected,
    transferForm, setTransferForm, transferModal, setTransferModal, loadingTransfer, doTransfer,
    transferProductTotal, loadingTransferProducts, loadingMoreTransferProducts, loadMoreTransferProducts,
    EMPTY_TRANSFER
  };
}
