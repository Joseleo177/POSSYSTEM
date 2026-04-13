import { useState } from "react";
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

    const loadProducts = async (p = 1) => {
        setLoading(true);
        setPage(p);
        try {
            const q = { limit, offset: (p - 1) * limit };
            if (search?.trim()) { q.search = search.trim(); }

            const r = await api.products.getAll(q);
            setProducts(r.data || []);
            setTotalProducts(r.total || 0);
        } catch (e) {
            notify("Error al conectar con el servidor", "err");
        } finally {
            setLoading(false);
        }
    };

    return { 
        products, loading, search, setSearch, loadProducts, 
        can, categories, notify,
        page, setPage, totalProducts, limit 
    };
}