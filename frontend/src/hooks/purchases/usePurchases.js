import { useCallback, useState } from "react";

// Sub-hooks
import { usePurchasesData } from "./usePurchasesData";
import { usePurchasesSearch } from "./usePurchasesSearch";
import { usePurchasesModals } from "./usePurchasesModals";
import { usePurchasesForm } from "./usePurchasesForm";
import { usePurchasesCalc } from "./usePurchasesCalc";
import { usePurchasesList } from "./usePurchasesList";

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

  // Lista y detalle
  const [purchases, setPurchases] = useState([]);
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
    setWarehouses,
    setCategories,
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
    setView("new");
  };

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

    // sub-hooks (orden importante: los wrappers van DESPUÉS)
    ...list,
    ...search,
    ...modals,
    ...form,
    ...calc,

    // wrappers — sobrescriben las versiones "crudas" de form/modals
    selectProduct,
    selectSupplier,

    // loading
    loading,

    // constantes
    EMPTY_ITEM,
  };
}
