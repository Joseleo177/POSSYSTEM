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
        setProductEditData({ name });
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
        const { name, price, stock, category_id, unit, qty_step } = form || {};
        if (!name || !price) return notify?.("Nombre y precio son requeridos", "err");

        setSavingProduct(true);
        try {
            const payload = {
                name,
                price: +price,
                stock: +stock,
                category_id: category_id || null,
                unit: unit || "unidad",
                qty_step: +qty_step || 1,
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
