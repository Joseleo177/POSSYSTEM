import { useState, useCallback, useEffect } from "react";
import { api } from "../../services/api";
import { useDebounce } from "../useDebounce";

export function useCobroProducts(activeWarehouse, notify) {
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState("");
    const [selectedCat, setSelectedCat] = useState("all");
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const debouncedSearch = useDebounce(search, 300);

    const loadProducts = useCallback(async (q = "") => {
        if (!activeWarehouse) return;
        try {
            const r = await api.warehouses.getProducts(activeWarehouse.id, q ? { search: q } : {});
            setProducts(r.data);
        } catch (e) { notify(e.message, "err"); }
    }, [activeWarehouse, notify]);

    useEffect(() => {
        if (activeWarehouse) loadProducts(debouncedSearch);
    }, [activeWarehouse, debouncedSearch, loadProducts]);

    const filteredProducts = products.filter(p => {
        return selectedCat === "all" || p.category_name === selectedCat;
    });

    return {
        products,
        search, setSearch,
        selectedCat, setSelectedCat,
        selectedIndex, setSelectedIndex,
        filteredProducts,
        loadProducts,
    };
}
