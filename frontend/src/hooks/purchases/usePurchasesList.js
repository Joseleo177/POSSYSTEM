import { useCallback } from "react";
import { api } from "../../services/api";

export function usePurchasesList({
    // estados principales
    purchases,
    setPurchases,
    detail,
    setDetail,
    view,
    setView,
    loading,
    setLoading,

    // confirmación de anulación
    cancelConfirm,
    setCancelConfirm,

    // dependencias externas
    notify,
    loadPurchases,
    onProductsUpdated,

    // formulario
    items,
    selectedWarehouseId,
    selectedSupplier,
    notes,
    resetForm,
}) {
    // ───────────────────────────────────────────────
    // ABRIR DETALLE
    // ───────────────────────────────────────────────
    const openDetail = useCallback(
        async id => {
            try {
                const r = await api.purchases.getOne(id);
                setDetail(r.data);
                setView("detail");
            } catch (e) {
                notify(e.message, "err");
            }
        },
        [notify, setDetail, setView]
    );

    // Refrescar detalle sin cambiar de vista (usado tras registrar un pago)
    const refreshDetail = useCallback(
        async id => {
            try {
                const r = await api.purchases.getOne(id);
                setDetail(r.data);
            } catch (e) {
                notify(e.message, "err");
            }
        },
        [notify, setDetail]
    );

    // ───────────────────────────────────────────────
    // ANULAR COMPRA
    // ───────────────────────────────────────────────
    const cancelPurchase = useCallback(
        async id => {
            try {
                await api.purchases.cancel(id);
                notify("Compra anulada ✓");
                await loadPurchases();
                onProductsUpdated?.();
            } catch (e) {
                notify(e.message, "err");
            }
        },
        [notify, loadPurchases, onProductsUpdated]
    );

    const cancelPurchaseAction = cancelPurchase;

    // ───────────────────────────────────────────────
    // GUARDAR COMPRA
    // ───────────────────────────────────────────────
    const savePurchase = useCallback(
        async () => {
            if (!items.length)
                return notify("Agrega al menos un producto", "err");

            if (!selectedWarehouseId)
                return notify("Selecciona el almacén destino", "err");

            setLoading(true);

            try {
                await api.purchases.create({
                    supplier_id: selectedSupplier?.id,
                    supplier_name: selectedSupplier?.name,
                    notes: notes || undefined,
                    warehouse_id: parseInt(selectedWarehouseId),
                    items: items.map(i => ({
                        product_id: i.product.id,
                        package_unit: i.package_unit,
                        package_size: parseFloat(i.package_size),
                        package_qty: parseFloat(i.package_qty),
                        package_price: parseFloat(i.package_price),
                        profit_margin: parseFloat(i.profit_margin),
                        update_price: i.update_price,
                        lot_number: i.lot_number,
                        expiration_date: i.expiration_date,
                    })),
                });

                notify("Compra registrada ✓");

                // recargar lista
                await loadPurchases();

                // notificar a inventario
                onProductsUpdated?.();

                // limpiar formulario y volver a la lista
                resetForm?.();
                setView("list");
            } catch (e) {
                notify(e.message, "err");
            } finally {
                setLoading(false);
            }
        },
        [
            items,
            selectedWarehouseId,
            selectedSupplier,
            notes,
            notify,
            loadPurchases,
            onProductsUpdated,
            resetForm,
            setLoading,
            setView,
        ]
    );

    return {
        // estados
        purchases,
        detail,
        view,
        loading,
        cancelConfirm,

        // acciones
        openDetail,
        refreshDetail,
        cancelPurchase,
        cancelPurchaseAction,
        savePurchase,
        setCancelConfirm,
    };
}
