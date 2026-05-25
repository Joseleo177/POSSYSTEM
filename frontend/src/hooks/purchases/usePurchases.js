import { useCallback, useState } from "react";

// Sub-hooks
import { usePurchasesData } from "./usePurchasesData";
import { usePurchasesSearch } from "./usePurchasesSearch";
import { usePurchasesModals } from "./usePurchasesModals";
import { usePurchasesForm } from "./usePurchasesForm";
import { usePurchasesCalc } from "./usePurchasesCalc";
import { usePurchasesList } from "./usePurchasesList";

// ───────────────────────────────────────────────
// Convierte un item del backend al formato del formulario
// ───────────────────────────────────────────────
const toFormItem = (i) => ({
  key: i.id,
  product: { id: i.product_id, name: i.product_name },
  package_unit: i.package_unit || "unidad",
  package_size: String(i.package_size ?? ""),
  package_qty: String(i.package_qty ?? 1),
  package_price: String(i.package_price ?? ""),
  profit_margin: i.profit_margin ?? 30,
  lot_number: i.lot_number || "",
  expiration_date: i.expiration_date || "",
  unit_cost: i.unit_cost ?? 0,
  sale_price: i.sale_price ?? 0,
  total_units: i.total_units ?? 0,
  subtotal: i.subtotal ?? 0,
});

// Constante
const EMPTY_ITEM = {
  product: null,
  package_unit: "",
  package_size: "",
  package_qty: 1,
  package_price: "",
  lot_number: "",
  expiration_date: "",
  profit_margin: 30,
  update_price: true,
};

export function usePurchases(notify, onProductsUpdated) {
  // ───────────────────────────────────────────────
  // ESTADOS PRINCIPALES
  // ───────────────────────────────────────────────
  const [view, setView] = useState("list");
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState(null);

  // Lista y detalle
  const [purchases, setPurchases] = useState([]);
  const [purchasesTotal, setPurchasesTotal] = useState(0);
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [listSearch, setListSearch] = useState("");
  const [listStatus, setListStatus] = useState("");
  const [listOrderStatus, setListOrderStatus] = useState("");
  const [listDateFrom, setListDateFrom] = useState("");
  const [listDateTo, setListDateTo] = useState("");
  const [detail, setDetail] = useState(null);

  // Almacenes / categorías
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [categories, setCategories] = useState([]);

  // Búsquedas
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierResults, setSupplierResults] = useState([]);

  // Modales
  const [supplierModal, setSupplierModal] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [supplierEditData, setSupplierEditData] = useState(null);
  const [productEditData, setProductEditData] = useState(null);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Formulario de compra
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([]);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);

  // ───────────────────────────────────────────────
  // SUB-HOOKS
  // ───────────────────────────────────────────────
  const data = usePurchasesData({
    setPurchases,
    setPurchasesTotal,
    purchasesPage,
    setWarehouses,
    setCategories,
    listSearch,
    listStatus,
    listOrderStatus,
    listDateFrom,
    listDateTo,
    notify,
  });

  const search = usePurchasesSearch({
    productSearch,
    setProductSearch,
    productResults,
    setProductResults,
    searching,
    setSearching,

    supplierSearch,
    setSupplierSearch,
    supplierResults,
    setSupplierResults,
  });

  // form se define ANTES que modals para que modals reciba la referencia real
  // de selectProduct (evita el closure roto del refactor anterior)
  const form = usePurchasesForm({
    itemForm,
    setItemForm,
    items,
    setItems,
    selectedSupplier,
    setSelectedSupplier,
    notes,
    setNotes,
    notify,
  });

  const modals = usePurchasesModals({
    supplierModal,
    setSupplierModal,
    productModal,
    setProductModal,

    supplierEditData,
    setSupplierEditData,
    productEditData,
    setProductEditData,

    savingSupplier,
    setSavingSupplier,
    savingProduct,
    setSavingProduct,

    setSelectedSupplier,
    selectProduct: form.selectProduct,
    clearProductSearch: search.clearProductSearch,
    clearSupplierSearch: search.clearSupplierSearch,
    notify,
  });

  const calc = usePurchasesCalc({
    itemForm,
    items,
  });

  const list = usePurchasesList({
    purchases,
    setPurchases,
    detail,
    setDetail,
    view,
    setView,
    loading,
    setLoading,

    cancelConfirm,
    setCancelConfirm,

    notify,
    loadPurchases: data.loadPurchases,
    onProductsUpdated,

    items,
    selectedWarehouseId,
    selectedSupplier,
    notes,
    resetForm: form.resetForm,
  });

  // ───────────────────────────────────────────────
  // ENVOLTORIOS PARA UI (limpian las búsquedas al seleccionar)
  // ───────────────────────────────────────────────
  const selectProduct = useCallback(
    (p) => {
      form.selectProduct(p);
      search.clearProductSearch();
    },
    [form, search]
  );

  const selectSupplier = useCallback(
    (s) => {
      setSelectedSupplier(s);
      search.clearSupplierSearch();
    },
    [search]
  );

  const openNew = () => {
    form.resetForm();
    setEditingDraftId(null);
    setView("new");
  };

  const openEditDraft = useCallback(
    (detail) => {
      setItems((detail.items || []).map(toFormItem));
      setSelectedWarehouseId(detail.warehouse_id ? String(detail.warehouse_id) : "");
      setSelectedSupplier(
        detail.supplier_id
          ? { id: detail.supplier_id, name: detail.supplier_name, rif: null }
          : null
      );
      setNotes(detail.notes || "");
      setEditingDraftId(detail.id);
      setView("new");
    },
    [setItems, setSelectedWarehouseId, setSelectedSupplier, setNotes, setView]
  );

  const savePurchase = useCallback(
    () => {
      if (editingDraftId) return list.updateDraft(editingDraftId);
      return list.savePurchase();
    },
    [editingDraftId, list]
  );

  const addItemFromModal = useCallback(
    (item) => setItems((prev) => [...prev, item]),
    []
  );

  // ───────────────────────────────────────────────
  // RETORNO FINAL
  // ───────────────────────────────────────────────
  return {
    // vistas
    view,
    setView,
    openNew,

    // datos
    warehouses,
    selectedWarehouseId,
    setSelectedWarehouseId,
    categories,

    // paginación + filtros de lista
    purchasesTotal,
    purchasesPage,
    setPurchasesPage,
    listSearch,
    setListSearch,
    listStatus,
    setListStatus,
    listOrderStatus,
    setListOrderStatus,
    listDateFrom,
    setListDateFrom,
    listDateTo,
    setListDateTo,

    // sub-hooks (orden importante: los wrappers van DESPUÉS)
    ...list,
    ...search,
    ...modals,
    ...form,
    ...calc,

    // wrappers — sobrescriben las versiones "crudas" de form/modals
    selectProduct,
    selectSupplier,
    addItemFromModal,
    savePurchase,
    openEditDraft,
    editingDraftId,

    // loading
    loading,

    // constantes
    EMPTY_ITEM,
  };
}
