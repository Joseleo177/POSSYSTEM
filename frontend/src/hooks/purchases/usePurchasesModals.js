import { api } from "../../services/api";

export function usePurchasesModals({
    // estados de modales
    supplierModal,
    setSupplierModal,
    productModal,
    setProductModal,

    // datos de edición
    supplierEditData,
    setSupplierEditData,
    productEditData,
    setProductInitialName,
    setProductEditData,

    // loading
    savingSupplier,
    setSavingSupplier,
    savingProduct,
    setSavingProduct,

    // dependencias externas
    setSelectedSupplier,
    selectProduct,         // referencia estable a la acción real del form
    clearProductSearch,
    clearSupplierSearch,
    selectedWarehouseId,   // almacén destino de la compra en curso
    notify,
}) {
    // ───────────────────────────────────────────────
    // ABRIR MODALES
    // ───────────────────────────────────────────────
    // CustomerModal espera _newType y _newName cuando se crea desde otro flujo
    const openCreateSupplier = (name = "") => {
        setSupplierEditData({ _newType: "proveedor", _newName: name });
        setSupplierModal(true);
    };

    const openCreateProduct = (name = "") => {
        setProductEditData(null);
        setProductInitialName(name);
        setProductModal(true);
    };

    // ───────────────────────────────────────────────
    // CERRAR MODALES
    // ───────────────────────────────────────────────
    const closeSupplierModal = () => {
        setSupplierModal(false);
        setSupplierEditData(null);
    };

    const closeProductModal = () => {
        setProductModal(false);
        setProductEditData(null);
    };

    // ───────────────────────────────────────────────
    // GUARDAR PROVEEDOR (es un customer con type=proveedor)
    // ───────────────────────────────────────────────
    const saveSupplier = async (form) => {
        if (!form?.name) return notify?.("El nombre es requerido", "err");

        setSavingSupplier(true);
        try {
            const r = await api.customers.create({ ...form, type: "proveedor" });
            notify?.("Proveedor registrado exitosamente");
            setSelectedSupplier(r.data);
            clearSupplierSearch?.();
            closeSupplierModal();
        } catch (e) {
            notify?.(e.message, "err");
        } finally {
            setSavingSupplier(false);
        }
    };

    // ───────────────────────────────────────────────
    // GUARDAR PRODUCTO
    // ───────────────────────────────────────────────
    const saveProduct = async (form, imageFile) => {
        if (!form?.name || !form?.price) return notify?.("Nombre y precio son requeridos", "err");

        setSavingProduct(true);
        try {
            // Se envía el formulario completo. Antes se armaba un payload a mano con solo
            // 6 campos y se descartaban en silencio costo, margen, código de barras, mínimo
            // de stock y embalaje — todo lo que el usuario había llenado en el modal.
            const payload = {
                ...form,
                price: +form.price,
                qty_step: +form.qty_step || 1,
                unit: form.unit || "unidad",
                category_id: form.category_id || null,
                // Sin almacén el producto no genera fila en product_stock y queda invisible
                // en el catálogo filtrado por almacén hasta que se reciba la compra.
                ...(selectedWarehouseId ? { warehouse_id: selectedWarehouseId } : {}),
            };
            const r = await api.products.create(payload, imageFile);
            notify?.("Producto creado exitosamente");
            if (r?.data) selectProduct?.(r.data); // lo coloca en el formulario
            closeProductModal();
            clearProductSearch?.();
        } catch (e) {
            notify?.(e.message, "err");
        } finally {
            setSavingProduct(false);
        }
    };

    return {
        // estados
        supplierModal,
        productModal,
        supplierEditData,
        productEditData,
        savingSupplier,
        savingProduct,

        // abrir
        openCreateSupplier,
        openCreateProduct,

        // cerrar
        closeSupplierModal,
        closeProductModal,

        // guardar
        saveSupplier,
        saveProduct,
    };
}
