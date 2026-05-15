import { useCallback, useEffect } from "react";
import { api } from "../../services/api";

export function usePurchasesData({
    setPurchases,
    setPurchasesTotal,
    purchasesPage,
    setWarehouses,
    setCategories,
    listSearch,
    listStatus,
    listDateFrom,
    listDateTo,
    notify,
}) {
    const LIMIT = 50;

    // ───────────────────────────────────────────────
    // CARGAR LISTA DE COMPRAS (paginada + filtros)
    // ───────────────────────────────────────────────
    const loadPurchases = useCallback(async (page = purchasesPage) => {
        try {
            const params = { limit: LIMIT, offset: (page - 1) * LIMIT };
            if (listSearch?.trim()) params.search = listSearch.trim();
            if (listStatus)         params.status = listStatus;
            if (listDateFrom)       params.date_from = listDateFrom;
            if (listDateTo)         params.date_to = listDateTo;
            const r = await api.purchases.getAll(params);
            setPurchases(r.data);
            if (r.total !== undefined) setPurchasesTotal(r.total);
        } catch (e) {
            notify(e.message, "err");
        }
    }, [notify, setPurchases, setPurchasesTotal, purchasesPage, listSearch, listStatus, listDateFrom, listDateTo]);

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
