import { useState, useCallback, useEffect } from "react";
import { api } from "../../services/api";
import { useDebounce } from "../useDebounce";

const LIMIT = 30;

export function useCobroProducts(activeWarehouse, notify) {
    const [products, setProducts]       = useState([]);
    const [total, setTotal]             = useState(0);
    const [offset, setOffset]           = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [search, setSearch]           = useState("");
    const [selectedCat, setSelectedCat] = useState("all");
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const debouncedSearch = useDebounce(search, 300);
    const debouncedCat    = useDebounce(selectedCat, 150);

    // Carga una página de productos
    const loadProducts = useCallback(async (q = "", cat = "all", off = 0, replace = true) => {
        if (!activeWarehouse) return;
        if (!replace) setLoadingMore(true);
        try {
            const params = { search: q, limit: LIMIT, offset: off };
            if (cat && cat !== "all") params.category = cat;
            const r = await api.warehouses.getProducts(activeWarehouse.id, params);
            setTotal(r.total ?? 0);
            setProducts(prev => replace ? r.data : [...prev, ...r.data]);
            setOffset(off + r.data.length);
        } catch (e) { notify(e.message, "err"); }
        finally { if (!replace) setLoadingMore(false); }
    }, [activeWarehouse, notify]);

    // Resetear y recargar cuando cambia búsqueda, categoría o almacén
    useEffect(() => {
        setOffset(0);
        setProducts([]);
        if (activeWarehouse) loadProducts(debouncedSearch, debouncedCat, 0, true);
    }, [activeWarehouse, debouncedSearch, debouncedCat]); // eslint-disable-line

    // Cargar más (llamado por el sentinel)
    const loadMore = useCallback(() => {
        if (loadingMore || products.length >= total) return;
        loadProducts(debouncedSearch, debouncedCat, offset, false);
    }, [loadingMore, products.length, total, debouncedSearch, debouncedCat, offset, loadProducts]);

    const hasMore = products.length < total;

    return {
        products,
        search, setSearch,
        selectedCat, setSelectedCat,
        selectedIndex, setSelectedIndex,
        filteredProducts: products,   // ya filtrado server-side
        loadMore,
        loadingMore,
        hasMore,
    };
}
