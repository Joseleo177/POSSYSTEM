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

    const refreshDetail = useCallback(
        async id => {
            try {
                const r = await api.purchases.getOne(id);
                setDetail(r.data);
                setPurchases(prev =>
                    prev.map(p =>
                        p.id === id
                            ? {
                                  ...p,
                                  status: r.data.status,
                                  payment_status: r.data.payment_status,
                                  amount_paid: r.data.amount_paid,
                                  balance: r.data.balance,
                              }
                            : p
                    )
                );
            } catch (e) {
                notify(e.message, "err");
            }
        },
        [notify, setDetail, setPurchases]
    );

    const cancelPurchase = useCallback(
        async id => {
            try {
                await api.purchases.cancel(id);
                notify("Orden eliminada ✓");
                await loadPurchases();
                onProductsUpdated?.();
            } catch (e) {
                notify(e.message, "err");
            }
        },
        [notify, loadPurchases, onProductsUpdated]
    );

    const confirmOrder = useCallback(
        async id => {
            setLoading(true);
            try {
                const r = await api.purchases.confirm(id);
                notify("Orden confirmada ✓");
                setDetail(r.data);
                setPurchases(prev => prev.map(p => p.id === id ? { ...p, status: "pendiente" } : p));
            } catch (e) {
                notify(e.message, "err");
            } finally {
                setLoading(false);
            }
        },
        [notify, setDetail, setLoading, setPurchases]
    );

    const receivePurchase = useCallback(
        async id => {
            setLoading(true);
            try {
                const r = await api.purchases.receive(id);
                notify("Mercancía recibida y stock actualizado ✓");
                setDetail(r.data);
                setPurchases(prev => prev.map(p => p.id === id ? { ...p, status: "recibido" } : p));
                onProductsUpdated?.();
            } catch (e) {
                notify(e.message, "err");
            } finally {
                setLoading(false);
            }
        },
        [notify, setDetail, setLoading, setPurchases, onProductsUpdated]
    );

    const _buildItemsPayload = (items) =>
        items.map(i => ({
            product_id: i.product.id,
            package_unit: i.package_unit,
            package_size: parseFloat(i.package_size),
            package_qty: parseFloat(i.package_qty),
            package_price: parseFloat(i.package_price) || 0,
            profit_margin: parseFloat(i.profit_margin) || 0,
            lot_number: i.lot_number || null,
            expiration_date: i.expiration_date || null,
            update_price: i.update_price !== false,
        }));

    const savePurchase = useCallback(
        async () => {
            if (!items.length)
                return notify("Agrega al menos un producto", "err");

            setLoading(true);
            try {
                const r = await api.purchases.create({
                    supplier_id: selectedSupplier?.id,
                    supplier_name: selectedSupplier?.name,
                    notes: notes || undefined,
                    warehouse_id: selectedWarehouseId ? parseInt(selectedWarehouseId) : undefined,
                    status: "borrador",
                    items: _buildItemsPayload(items),
                });
                notify("Borrador guardado ✓");
                resetForm?.();
                loadPurchases();
                const newId = r?.data?.id ?? r?.id;
                if (newId) {
                    const detail = await api.purchases.getOne(newId);
                    setDetail(detail.data);
                    setView("detail");
                } else {
                    setView("list");
                }
            } catch (e) {
                notify(e.message, "err");
            } finally {
                setLoading(false);
            }
        },
        [items, selectedWarehouseId, selectedSupplier, notes, notify, loadPurchases, resetForm, setLoading, setView, setDetail]
    );

    const updateDraft = useCallback(
        async (draftId) => {
            if (!items.length)
                return notify("Agrega al menos un producto", "err");

            setLoading(true);
            try {
                await api.purchases.update(draftId, {
                    supplier_id: selectedSupplier?.id,
                    supplier_name: selectedSupplier?.name,
                    notes: notes || undefined,
                    warehouse_id: selectedWarehouseId ? parseInt(selectedWarehouseId) : undefined,
                    items: _buildItemsPayload(items),
                });
                notify("Borrador actualizado ✓");
                resetForm?.();
                loadPurchases();
                const detail = await api.purchases.getOne(draftId);
                setDetail(detail.data);
                setView("detail");
            } catch (e) {
                notify(e.message, "err");
            } finally {
                setLoading(false);
            }
        },
        [items, selectedWarehouseId, selectedSupplier, notes, notify, loadPurchases, resetForm, setLoading, setView, setDetail]
    );

    return {
        purchases,
        detail,
        view,
        loading,
        cancelConfirm,

        openDetail,
        refreshDetail,
        cancelPurchase,
        cancelPurchaseAction: cancelPurchase,
        confirmOrder,
        receivePurchase,
        savePurchase,
        updateDraft,
        setCancelConfirm,
    };
}
