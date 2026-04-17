import { useCallback, useEffect } from "react";
import { api } from "../../services/api";

export function usePurchasesSearch({
    // Productos
    productSearch,
    setProductSearch,
    productResults,
    setProductResults,
    searching,
    setSearching,

    // Proveedores
    supplierSearch,
    setSupplierSearch,
    supplierResults,
    setSupplierResults,
}) {
    // ───────────────────────────────────────────────
    // BÚSQUEDA DE PRODUCTOS (con debounce + cleanup)
    // ───────────────────────────────────────────────
    useEffect(() => {
        if (!productSearch.trim()) {
            setProductResults([]);
            setSearching(false);
            return;
        }

        let active = true;

        const delayDebounceFn = setTimeout(async () => {
            if (!active) return;
            setSearching(true);
            try {
                const r = await api.products.getAll({
                    search: productSearch,
                    is_combo: false,
                    is_service: false,
                    limit: 20,
                });
                if (active) setProductResults(r.data || r);
            } catch (error) {
                if (active) {
                    console.error("Error en la búsqueda de productos:", error);
                    setProductResults([]);
                }
            } finally {
                if (active) setSearching(false);
            }
        }, 400);

        return () => {
            active = false;
            clearTimeout(delayDebounceFn);
        };
    }, [productSearch, setProductResults, setSearching]);

    // ───────────────────────────────────────────────
    // BÚSQUEDA DE PROVEEDORES
    // (en este sistema los proveedores son customers con type=proveedor)
    // ───────────────────────────────────────────────
    useEffect(() => {
        if (!supplierSearch.trim()) {
            setSupplierResults([]);
            return;
        }

        let active = true;

        const delayDebounceFn = setTimeout(async () => {
            try {
                const r = await api.customers.getAll({
                    search: supplierSearch,
                    type: "proveedor",
                    limit: 15,
                });
                if (active) setSupplierResults(r.data || r);
            } catch (err) {
                if (active) {
                    console.error("Error buscando proveedores:", err);
                    setSupplierResults([]);
                }
            }
        }, 300);

        return () => {
            active = false;
            clearTimeout(delayDebounceFn);
        };
    }, [supplierSearch, setSupplierResults]);

    // ───────────────────────────────────────────────
    // LIMPIAR BÚSQUEDAS
    // ───────────────────────────────────────────────
    const clearProductSearch = useCallback(() => {
        setProductSearch("");
        setProductResults([]);
    }, [setProductSearch, setProductResults]);

    const clearSupplierSearch = useCallback(() => {
        setSupplierSearch("");
        setSupplierResults([]);
    }, [setSupplierSearch, setSupplierResults]);

    return {
        // Productos
        productSearch,
        setProductSearch,
        productResults,
        searching,
        clearProductSearch,

        // Proveedores
        supplierSearch,
        setSupplierSearch,
        supplierResults,
        clearSupplierSearch,
    };
}
