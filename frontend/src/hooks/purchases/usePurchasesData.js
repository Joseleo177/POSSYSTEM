import { useCallback, useEffect } from "react";
import { api } from "../../services/api";

export function usePurchasesData({
    setPurchases,
    setWarehouses,
    setCategories,
    notify,
}) {
    // ───────────────────────────────────────────────
    // CARGAR LISTA DE COMPRAS
    // ───────────────────────────────────────────────
    const loadPurchases = useCallback(async () => {
        try {
            const r = await api.purchases.getAll();
            setPurchases(r.data);
        } catch (e) {
            notify(e.message, "err");
        }
    }, [notify, setPurchases]);

    // ───────────────────────────────────────────────
    // CARGAR ALMACENES
    // ───────────────────────────────────────────────
    const loadWarehouses = useCallback(async () => {
        try {
            const r = await api.warehouses.getAll();
            const active = r.data.filter(w => w.active);
            setWarehouses(active);
        } catch (e) {
            console.error(e);
        }
    }, [setWarehouses]);

    // ───────────────────────────────────────────────
    // CARGAR CATEGORÍAS
    // ───────────────────────────────────────────────
    const loadCategories = useCallback(async () => {
        try {
            const r = await api.categories.getAll();
            setCategories(r.data);
        } catch (e) {
            console.error(e);
        }
    }, [setCategories]);

    // ───────────────────────────────────────────────
    // EFECTO INICIAL
    // ───────────────────────────────────────────────
    useEffect(() => {
        loadPurchases();
        loadWarehouses();
        loadCategories();
    }, [loadPurchases, loadWarehouses, loadCategories]);

    return {
        loadPurchases,
        loadWarehouses,
        loadCategories,
    };
}
