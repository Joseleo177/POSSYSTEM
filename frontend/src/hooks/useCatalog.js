import { useState, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";

export function useCatalog() {
    const { notify, can, categories } = useApp();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [totalProducts, setTotalProducts] = useState(0);
    const limit = 50;

    // Filtros
    const [filterCategory, setFilterCategory] = useState("");
    const [filterType, setFilterType] = useState("");      // "" | "service" | "combo" | "normal"

    const activeFilterCount = [filterCategory, filterType].filter(Boolean).length;

    const clearFilters = () => {
        setFilterCategory("");
        setFilterType("");
    };

    const loadProducts = useCallback(async (p = 1, warehouseId = null) => {
        setLoading(true);
        setPage(p);
        try {
            const q = { limit, offset: (p - 1) * limit };
            if (search?.trim()) q.search = search.trim();
            if (warehouseId) q.warehouse_id = warehouseId;

            if (filterCategory) q.category_id = filterCategory;
            if (filterType === "service") q.is_service = true;
            else if (filterType === "combo") q.is_combo = true;
            else if (filterType === "normal") { q.is_service = false; q.is_combo = false; }

            const r = await api.products.getAll(q);
            setProducts(r.data || []);
            setTotalProducts(r.total || 0);
        } catch (e) {
            notify("Error al conectar con el servidor", "err");
        } finally {
            setLoading(false);
        }
    }, [notify, search, limit, filterCategory, filterType]);

    return {
        products, loading, search, setSearch, loadProducts,
        can, categories, notify,
        page, setPage, totalProducts, limit,
        filterCategory, setFilterCategory,
        filterType, setFilterType,
        activeFilterCount, clearFilters,
    };
}
