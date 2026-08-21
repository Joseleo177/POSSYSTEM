import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../../services/api";
import { onSSE } from "../../services/sse";
import { useDebounce } from "../useDebounce";

const LIMIT = 30;

// Cada cuánto se vuelve a pedir el stock por si el aviso en vivo no llegó.
//
// El SSE del backend guarda los clientes conectados en memoria del proceso, así que solo
// funciona con un servidor persistente (el contenedor Docker). En un despliegue serverless
// —Vercel— cada petición cae en una instancia distinta: quien emite el evento no ve a quien
// está escuchando y el aviso se pierde siempre. Sin este refresco, un cajero puede pasar
// horas viendo existencias de hace rato.
const REFRESH_MS = 25_000;

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

    // Carga una página de productos. `pageSize` solo lo usa el refresco periódico, para
    // volver a traer TODO lo que el cajero ya tenía cargado en vez de devolverlo a la
    // primera página cada vez que se refresca.
    const loadProducts = useCallback(async (q = "", cat = "all", off = 0, replace = true, pageSize = LIMIT) => {
        if (!activeWarehouse) return;
        if (!replace) setLoadingMore(true);
        try {
            // sellable_only: la caja no ofrece insumos. Inventario, ajustes y transferencias
            // no mandan el filtro, porque ahí sí hay que poder contarlos y moverlos.
            const params = { search: q, limit: pageSize, offset: off, sellable_only: true };
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

    // Espejo del offset: el intervalo de refresco se crea una sola vez y necesita saber
    // cuánto hay cargado sin reiniciarse cada vez que el cajero hace scroll.
    const offsetRef = useRef(0);
    useEffect(() => { offsetRef.current = offset; }, [offset]);

    // Refrescar en tiempo real cuando el servidor notifica cambio de precios
    useEffect(() => {
        if (!activeWarehouse) return;
        // Se piden de nuevo todas las páginas que el cajero ya tenía a la vista: recargar
        // solo la primera lo devolvería al principio de la lista cada refresco.
        const refresh = () => loadProducts(debouncedSearch, debouncedCat, 0, true, Math.max(LIMIT, offsetRef.current));
        const unsubSSE  = onSSE('products:updated', refresh);
        // Fallback: refrescar al volver al tab (por si SSE se reconecta tarde)
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        // Red de seguridad para cuando el aviso en vivo no llega (ver REFRESH_MS). Solo con
        // la pestaña a la vista: una caja minimizada no necesita datos frescos y cada
        // consulta cuesta en un backend serverless.
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') refresh();
        }, REFRESH_MS);
        return () => {
            unsubSSE();
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [activeWarehouse, debouncedSearch, debouncedCat, loadProducts]);

    // Cargar más (llamado por el sentinel)
    const loadMore = useCallback(() => {
        if (loadingMore || products.length >= total) return;
        loadProducts(debouncedSearch, debouncedCat, offset, false);
    }, [loadingMore, products.length, total, debouncedSearch, debouncedCat, offset, loadProducts]);

    const hasMore = products.length < total;

    const reload = useCallback(() => {
        loadProducts(debouncedSearch, debouncedCat, 0, true);
    }, [loadProducts, debouncedSearch, debouncedCat]);

    return {
        products,
        search, setSearch,
        selectedCat, setSelectedCat,
        selectedIndex, setSelectedIndex,
        filteredProducts: products,   // ya filtrado server-side
        loadMore,
        loadingMore,
        hasMore,
        reload,
    };
}
