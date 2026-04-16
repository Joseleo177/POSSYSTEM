import { useEffect } from "react";

export function useCobroKeyboard({
    cart, receipt, holdCart,
    filteredProducts, selectedIndex, setSelectedIndex,
    addToCart, checkout,
    showConfirmCheckout, setShowConfirmCheckout,
    setSearch, setShowPayModal,
    searchInputRef,
    customers, selectedCustIdx, setSelectedCustIdx,
    setSelectedCustomer, setCustomers, setCustSearch,
    openQtyModal, notify,
}) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";

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

            if (e.key === "F1") { e.preventDefault(); setSelectedIndex(-1); searchInputRef.current?.focus(); }
            if (e.key === "F2") { e.preventDefault(); document.getElementById("customer-search-input")?.focus(); }
            if (e.key === "F4") { e.preventDefault(); holdCart(); }
            if (e.key === "F10") { e.preventDefault(); if (cart.length > 0) setShowConfirmCheckout(true); }
            if (e.key === "Escape") {
                setSearch(""); setSelectedIndex(-1);
                setShowPayModal(false); setShowConfirmCheckout(false);
                searchInputRef.current?.focus();
            }

            // Navegación en grilla
            if (e.key === "ArrowDown") {
                if (e.target === searchInputRef.current) { e.preventDefault(); setSelectedIndex(0); }
                else if (selectedIndex >= 0) { e.preventDefault(); setSelectedIndex(p => Math.min(p + 4, filteredProducts.length - 1)); }
            }
            if (e.key === "ArrowUp" && selectedIndex >= 0) {
                e.preventDefault();
                setSelectedIndex(p => Math.max(p - 4, -1));
                if (selectedIndex < 4) searchInputRef.current?.focus();
            }
            if (e.key === "ArrowRight" && selectedIndex >= 0) { e.preventDefault(); setSelectedIndex(p => Math.min(p + 1, filteredProducts.length - 1)); }
            if (e.key === "ArrowLeft" && selectedIndex >= 0) { e.preventDefault(); setSelectedIndex(p => Math.max(p - 1, 0)); }

            if (e.key === "Enter") {
                if (showConfirmCheckout) { e.preventDefault(); setShowConfirmCheckout(false); checkout(); return; }
                if (selectedIndex >= 0 && e.target === searchInputRef.current) {
                    e.preventDefault();
                    const p = filteredProducts[selectedIndex];
                    if (p) {
                        const hasUnlimitedStock = p.is_service || (p.is_combo && p.stock === null);
                        if (!hasUnlimitedStock && parseFloat(p.stock) <= 0) {
                            return notify("Este producto no tiene existencias en el inventario", "error");
                        }
                        openQtyModal(p);
                    }
                } else if (!isInput && cart.length > 0 && !receipt) {
                    setShowConfirmCheckout(true);
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [cart, holdCart, receipt, selectedIndex, filteredProducts, addToCart, showConfirmCheckout,
        checkout, customers, selectedCustIdx, setSelectedCustomer, setCustomers, setCustSearch,
        setSelectedCustIdx, setSelectedIndex, setSearch, setShowPayModal, setShowConfirmCheckout, searchInputRef, openQtyModal]);
}
