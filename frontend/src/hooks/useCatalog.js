import { useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";

export function useCatalog() {
    const { notify, can, categories } = useApp();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");

    const loadProducts = async (warehouseId = "") => {
        setLoading(true);
        try {
            const q = { limit: 50, offset: 0 };
            if (search?.trim()) q.search = search.trim();
            if (warehouseId && warehouseId !== "undefined") q.warehouse_id = warehouseId;

            const r = await api.products.getAll(q);
            setProducts(r.data || []);
        } catch (e) {
            notify("Error al conectar con el servidor", "err");
        } finally {
            setLoading(false);
        }
    };

    return { products, loading, search, setSearch, loadProducts, can, categories, notify };
}