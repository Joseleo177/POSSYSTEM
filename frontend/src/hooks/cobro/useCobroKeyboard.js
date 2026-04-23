import { useEffect } from "react";

export function useCobroKeyboard({
    cart, receipt, holdCart,
    filteredProducts, selectedIndex, setSelectedIndex,
    checkout,
    showConfirmCheckout, setShowConfirmCheckout,
    setSearch, setShowPayModal,
    searchInputRef,
    customers, selectedCustIdx, setSelectedCustIdx,
    setSelectedCustomer, setCustomers, setCustSearch,
    openQtyModal, notify,
}) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "F1") { e.preventDefault(); setSelectedIndex(-1); searchInputRef.current?.focus(); return; }

            // Navegación en buscador de clientes
            if (e.target.id === "customer-search-input") {
                if (e.key === "ArrowDown") { e.preventDefault(); setSelectedCustIdx(p => Math.min(p + 1, customers.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setSelectedCustIdx(p => Math.max(p - 1, 0)); }
                if (e.key === "Enter" && selectedCustIdx >= 0) {
                    e.preventDefault();
                    const c = customers[selectedCustIdx];
                    if (c) { setSelectedCustomer(c); setCustomers([]); setCustSearch(""); setSelectedCustIdx(-1); searchInputRef.current?.focus(); }
                }
                return;
            }

            if (e.key === "F2") { e.preventDefault(); document.getElementById("customer-search-input")?.focus(); }
            if (e.key === "F4") { e.preventDefault(); holdCart(); }
            if (e.key === "F10") { e.preventDefault(); if (cart.length > 0) setShowConfirmCheckout(true); }
            if (e.key === "Escape") {
                setSearch("");
                setSelectedIndex(-1);
                setShowPayModal(false);
                setShowConfirmCheckout(false);
                searchInputRef.current?.focus();
            }

            // Navegación horizontal en grilla
            if (e.key === "ArrowRight") {
                e.preventDefault();
                if (selectedIndex < 0) {
                    setSelectedIndex(0);
                } else {
                    setSelectedIndex(p => Math.min(p + 1, filteredProducts.length - 1));
                }
            }
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                if (selectedIndex > 0) {
                    setSelectedIndex(p => p - 1);
                } else {
                    setSelectedIndex(-1);
                    searchInputRef.current?.focus();
                }
            }

            if (e.key === "Enter") {
                if (showConfirmCheckout) { e.preventDefault(); setShowConfirmCheckout(false); checkout(); return; }

                // Caso especial: Lector de Barras (Buscador con 1 solo resultado)
                if (e.target.id === "product-search-input" && selectedIndex < 0 && filteredProducts.length === 1) {
                    e.preventDefault();
                    const p = filteredProducts[0];
                    if (p) {
                        const hasUnlimitedStock = p.is_service || (p.is_combo && p.stock === null);
                        if (!hasUnlimitedStock && parseFloat(p.stock) <= 0) {
                            return notify("Este producto no tiene existencias en el inventario", "error");
                        }
                        setSearch(""); // Limpiar búsqueda para el siguiente escaneo
                        openQtyModal(p);
                        return;
                    }
                }

                if (selectedIndex >= 0) {
                    e.preventDefault();
                    const p = filteredProducts[selectedIndex];
                    if (p) {
                        const hasUnlimitedStock = p.is_service || (p.is_combo && p.stock === null);
                        if (!hasUnlimitedStock && parseFloat(p.stock) <= 0) {
                            return notify("Este producto no tiene existencias en el inventario", "error");
                        }
                        openQtyModal(p);
                    }
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [cart, holdCart, receipt, selectedIndex, filteredProducts, showConfirmCheckout,
        checkout, customers, selectedCustIdx, setSelectedCustomer, setCustomers, setCustSearch,
        setSelectedCustIdx, setSelectedIndex, setSearch, setShowPayModal, setShowConfirmCheckout,
        searchInputRef, openQtyModal, notify]);
}
