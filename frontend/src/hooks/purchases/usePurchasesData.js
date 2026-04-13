import { useCallback, useEffect } from "react";
import { api } from "../../services/api";

export function usePurchasesData({
    setPurchases,
    setPurchasesTotal,
    purchasesPage,
    setWarehouses,
    setCategories,
    notify,
}) {
    const LIMIT = 50;

    // ───────────────────────────────────────────────
    // CARGAR LISTA DE COMPRAS (paginada)
    // ───────────────────────────────────────────────
    const loadPurchases = useCallback(async (page = purchasesPage) => {
        try {
            const r = await api.purchases.getAll({ limit: LIMIT, offset: (page - 1) * LIMIT });
            setPurchases(r.data);
            if (r.total !== undefined) setPurchasesTotal(r.total);
        } catch (e) {
            notify(e.message, "err");
        }
    }, [notify, setPurchases, setPurchasesTotal, purchasesPage]);

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
