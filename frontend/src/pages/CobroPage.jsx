import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "../context/AppContext";
import { useCart } from "../context/CartContext";
import { api } from "../services/api";
import CustomerModal from "../components/Customers/CustomerModal";
import ReceiptModal from "../components/ReceiptModal";
import PaymentFormModal from "../components/PaymentFormModal";
import AperturaCajaModal from "../components/AperturaCajaModal";
import CierreCajaModal from "../components/CierreCajaModal";
import { fmtMoney } from "../helpers";
import { useDebounce } from "../hooks/useDebounce";
import ConfirmModal from "../components/ui/ConfirmModal";
import CustomSelect from "../components/ui/CustomSelect";
import HeldCartsModal from "../components/HeldCartsModal";
import { Button } from "../components/ui/Button";

const fmt = fmtMoney;

export default function CobroPage() {
    const {
        notify, employee, baseCurrency, activeCurrencies, activeJournals,
        categories,
    } = useApp();

    const {
        cart, addToCart, removeFromCart, changeQty, setQtyDirect,
        subtotalBase, discountAmount, discountEnabled, setDiscountEnabled,
        discountPct, setDiscountPct, totalBase, totalDisplay,
        currentCurrency, setSelectedCurrency, exchangeRate,
        convertToDisplay,
        selectedSerieId, selectSerie, mySeries, loadMySeries,
        selectedCustomer, setSelectedCustomer,
        employeeWarehouses, activeWarehouse, switchWarehouse, loadEmployeeWarehouses,
        checkout, loading, receipt, setReceipt,
        heldCarts, holdCart, takeHeldCart, removeHeldCart,
    } = useCart();

    // ── Productos ──────────────────────────────────────────────
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 300);

    const loadProducts = useCallback(async (q = "") => {
        if (!activeWarehouse) return;
        try {
            const r = await api.warehouses.getProducts(activeWarehouse.id, q ? { search: q } : {});
            setProducts(r.data);
        } catch (e) { notify(e.message, "err"); }
    }, [activeWarehouse, notify]);

    useEffect(() => { loadEmployeeWarehouses(); loadMySeries(); }, [loadEmployeeWarehouses, loadMySeries]);

    // Verificar sesión de caja
    useEffect(() => {
        if (!employee?.id || !activeWarehouse?.id) return;
        setCheckingSession(true);
        api.cashSessions.current({ employee_id: employee.id, warehouse_id: activeWarehouse.id })
            .then(r => {
                if (r.data) {
                    setCashSession(r.data);
                    setShowApertura(false);
                } else {
                    setCashSession(null);
                    setShowApertura(true);
                }
            })
            .catch(() => {
                setCashSession(null);
                setShowApertura(true);
            })
            .finally(() => setCheckingSession(false));
    }, [employee?.id, activeWarehouse?.id]);

    useEffect(() => { if (activeWarehouse) loadProducts(debouncedSearch); }, [activeWarehouse, debouncedSearch, loadProducts]);

    // ── Clientes ───────────────────────────────────────────────
    const [customers, setCustomers] = useState([]);
    const [custSearch, setCustSearch] = useState("");
    const debouncedCustSearch = useDebounce(custSearch, 300);
    const [customerModal, setCustomerModal] = useState(false);
    const [customerEditData, setCustomerEditData] = useState(null);
    const [savingCustomer, setSavingCustomer] = useState(false);

    useEffect(() => {
        if (!debouncedCustSearch.trim()) { setCustomers([]); return; }
        const t = async () => {
            try {
                const r = await api.customers.getAll({ search: debouncedCustSearch });
                setCustomers(r.data.filter(c => c.type !== "proveedor"));
            } catch { }
        };
        t();
    }, [debouncedCustSearch]);

    const saveCustomer = async (form) => {
        if (!form.name) return notify("El nombre es requerido", "err");
        setSavingCustomer(true);
        try {
            const res = await api.customers.create(form);
            notify("Cliente registrado correctamente");
            if (customerEditData?._fromCobro && res?.data) {
                setSelectedCustomer(res.data);
                setCustSearch("");
            }
            setCustomerModal(false); setCustomerEditData(null);
        } catch (e) { notify(e.message, "err"); }
        setSavingCustomer(false);
    };

    const currSym = currentCurrency?.symbol || baseCurrency?.symbol || "$";
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [cashSession, setCashSession] = useState(null);
    const [checkingSession, setCheckingSession] = useState(true);
    const [showApertura, setShowApertura] = useState(false);
    const [showCierre, setShowCierre] = useState(false);
    const [saleBalance, setSaleBalance] = useState(null);
    const [showPayModal, setShowPayModal] = useState(false);
    const [selectedCat, setSelectedCat] = useState("all");
    const [showConfirmCheckout, setShowConfirmCheckout] = useState(false);
    const [mobileTab, setMobileTab] = useState("products"); // "products" | "cart"
    const [showHeldModal, setShowHeldModal] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [selectedCustIdx, setSelectedCustIdx] = useState(-1);
    const searchInputRef = useRef(null);

    const filteredProducts = products.filter(p => {
        const s = search.toLowerCase();
        const nameMatch = (p.name || "").toLowerCase().includes(s);
        const catMatch = (p.category_name || "").toLowerCase().includes(s);
        const matchesSearch = nameMatch || catMatch;
        return matchesSearch && (selectedCat === "all" || p.category_name === selectedCat);
    });

    // ── Atajos de Teclado ─────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e) => {
            const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

            // Navegación en Buscador de Clientes
            if (e.target.id === 'customer-search-input') {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedCustIdx(prev => Math.min(prev + 1, customers.length - 1));
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedCustIdx(prev => Math.max(prev - 1, 0));
                }
                if (e.key === 'Enter' && selectedCustIdx >= 0) {
                    e.preventDefault();
                    const c = customers[selectedCustIdx];
                    if (c) {
                        setSelectedCustomer(c);
                        setCustomers([]);
                        setCustSearch("");
                        setSelectedCustIdx(-1);
                        searchInputRef.current?.focus(); // Volver al foco de productos
                    }
                }
                return; // No procesar el resto de atajos si estamos en clientes
            }

            if (e.key === 'F1') {
                e.preventDefault();
                setSelectedIndex(-1);
                searchInputRef.current?.focus();
            }
            if (e.key === 'F2') {
                e.preventDefault();
                document.getElementById('customer-search-input')?.focus();
            }
            if (e.key === 'F4') {
                e.preventDefault();
                holdCart();
            }
            if (e.key === 'F10') {
                e.preventDefault();
                if (cart.length > 0) setShowConfirmCheckout(true);
            }
            if (e.key === 'Escape') {
                setSearch("");
                setSelectedIndex(-1);
                setShowPayModal(false);
                setShowConfirmCheckout(false);
                searchInputRef.current?.focus();
            }

            // Navegación en Grilla
            if (e.key === 'ArrowDown') {
                if (e.target === searchInputRef.current) {
                    e.preventDefault();
                    setSelectedIndex(0);
                } else if (selectedIndex >= 0) {
                    e.preventDefault();
                    setSelectedIndex(prev => Math.min(prev + 4, filteredProducts.length - 1));
                }
            }
            if (e.key === 'ArrowUp' && selectedIndex >= 0) {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 4, -1));
                if (selectedIndex < 4) searchInputRef.current?.focus();
            }
            if (e.key === 'ArrowRight' && selectedIndex >= 0) {
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, filteredProducts.length - 1));
            }
            if (e.key === 'ArrowLeft' && selectedIndex >= 0) {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            }

            // Seleccionar producto con Enter o Confirmar Venta
            if (e.key === 'Enter') {
                if (showConfirmCheckout) {
                    e.preventDefault();
                    setShowConfirmCheckout(false);
                    checkout();
                    return;
                }
                
                if (selectedIndex >= 0) {
                    e.preventDefault();
                    const p = filteredProducts[selectedIndex];
                    if (p) {
                        addToCart(p);
                        setTimeout(() => {
                            const input = document.getElementById(`qty-input-${p.id}`);
                            if (input) {
                                input.focus();
                                input.select(); 
                            }
                        }, 50);
                    }
                } else if (!isInput && cart.length > 0 && !receipt) {
                    setShowConfirmCheckout(true);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [cart, holdCart, receipt, selectedIndex, filteredProducts, addToCart]);

    if (employeeWarehouses.length === 0) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-10 animate-in fade-in duration-700">
            <div className="w-24 h-24 rounded-[40px] bg-surface-2 dark:bg-white/5 flex items-center justify-center text-brand-500 shadow-inner mb-4">
                <svg className="w-12 " fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <div className="font-black text-xl tracking-wide text-brand-500 uppercase">Sin Acceso a Almacén</div>
            <p className="text-sm text-content-subtle max-w-sm leading-relaxed font-medium">Tu usuario no tiene almacenes asignados.</p>
        </div>
    );

    const receiptRate = parseFloat(receipt?.exchange_rate || 1);
    const receiptIsBase = !receipt?.currency || receipt.currency.is_base;
    const receiptSym = receiptIsBase ? (baseCurrency?.symbol || "$") : (receipt?.currency?.symbol || "$");
    const fmtSale = (n) => fmt(receiptIsBase ? n : n * receiptRate, receiptSym);
    const currentBalance = saleBalance?.balance ?? parseFloat(receipt?.total || 0);
    const currentStatus = saleBalance?.status ?? "pendiente";

    if (receipt) {
        const statusLabel = currentStatus === "pagado" ? "Completado" : currentStatus === "parcial" ? "Abono Parcial" : "Pendiente";
        const badgeClass = currentStatus === "pagado" ? "bg-green-500/10 text-green-500 border-green-500/20" : currentStatus === "parcial" ? "bg-brand-500/10 text-brand-500 border-brand-500/20" : "bg-danger/10 text-danger border-danger/21";

        return (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                <div className="w-full max-w-sm bg-white dark:bg-surface-dark-2 rounded-xl shadow-2xl border border-border/20 dark:border-white/5 overflow-hidden">

                    {/* Header estado */}
                    <div className={`px-5 py-4 border-b border-border/20 dark:border-white/5 flex items-center gap-3 ${currentStatus === "pagado" ? "bg-success/5" : "bg-danger/5"}`}>
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${badgeClass}`}>
                            {currentStatus === "pagado"
                                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2" /></svg>
                            }
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Transacción Registrada</div>
                            <div className="text-sm font-black text-content dark:text-white">Orden #{receipt.invoice_number || receipt.id}</div>
                        </div>
                        <div className={`ml-auto text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${badgeClass}`}>
                            {statusLabel}
                        </div>
                    </div>

                    {/* Totales */}
                    <div className="px-5 py-4 space-y-2 border-b border-border/20 dark:border-white/5">
                        {parseFloat(receipt.discount_amount) > 0 && (
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 uppercase tracking-wide">Subtotal</span>
                                <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 tabular-nums">{fmtSale(parseFloat(receipt.total) + parseFloat(receipt.discount_amount || 0))}</span>
                            </div>
                        )}
                        {parseFloat(receipt.discount_amount) > 0 && (
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-danger uppercase tracking-wide">Descuento</span>
                                <span className="text-[11px] font-bold text-danger tabular-nums">-{fmtSale(receipt.discount_amount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-1">
                            <span className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40">Total a Pagar</span>
                            <span className="text-xl font-black text-brand-500 tabular-nums">{fmtSale(receipt.total)}</span>
                        </div>
                    </div>

                    {/* Acciones */}
                    <div className="px-5 py-4 flex flex-col gap-2">
                        {currentStatus !== "pagado" && (
                            <Button
                                onClick={() => setShowPayModal(true)}
                                className="w-full h-9 bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black shadow-none"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                                Registrar Pago Inmediato
                            </Button>
                        )}
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setShowReceiptModal(true)} className="flex-1 h-9 border border-border/30 dark:border-white/10">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Ver Ticket
                            </Button>
                            <Button onClick={() => { setReceipt(null); setSaleBalance(null); setShowPayModal(false); }} className="flex-1 h-9 shadow-none">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Siguiente
                            </Button>
                        </div>
                    </div>
                </div>
                <ReceiptModal open={showReceiptModal} onClose={() => setShowReceiptModal(false)} sale={receipt} />
                {showPayModal && receipt && (
                    <PaymentFormModal
                        sale={{ ...receipt, balance: currentBalance, amount_paid: saleBalance?.amount_paid ?? 0 }}
                        onClose={() => setShowPayModal(false)}
                        onSuccess={(res) => {
                            setSaleBalance({ amount_paid: res.amount_paid, balance: res.balance, status: res.sale_status });
                            setShowPayModal(false);
                        }}
                    />
                )}
            </div>
        );
    }



    return (
        <div className="h-full flex flex-col lg:flex-row bg-[#f8f9fc] dark:bg-[#080808] text-content dark:text-content-dark overflow-hidden font-sans animate-in fade-in duration-1000">

            {/* ── Sidebar (Carrito) ── */}
            <aside className={`w-full lg:w-[360px] lg:h-full bg-white dark:bg-[#0c0c0c] flex-col border-b lg:border-r border-border dark:border-white/5 shadow-[20px_0_60px_rgba(0,0,0,0.03)] z-20 shrink-0 order-2 lg:order-1 relative ${mobileTab === 'cart' ? 'flex' : 'hidden'} lg:flex`}>
                <div className="p-4 space-y-3 flex-1 flex flex-col overflow-hidden">
                    {/* Mobile toggle: Catálogo / Carrito */}
                    <div className="lg:hidden flex items-center gap-2">
                        <button onClick={() => setMobileTab("products")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${mobileTab === "products" ? "bg-brand-500 text-white" : "bg-surface-2 dark:bg-white/5 text-content-subtle"}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                            Catálogo
                        </button>
                        <button onClick={() => setMobileTab("cart")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all relative ${mobileTab === "cart" ? "bg-brand-500 text-white" : "bg-surface-2 dark:bg-white/5 text-content-subtle"}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                            Carrito
                            {cart.length > 0 && (
                                <span className="w-4 h-4 bg-danger text-white text-[11px] font-black rounded-full flex items-center justify-center">{cart.length}</span>
                            )}
                        </button>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                            </div>
                            <h2 className="text-[11px] font-black text-content dark:text-white tracking-wide uppercase leading-none">Checkout</h2>
                        </div>
                        {cashSession && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowHeldModal(true)}
                                    className="relative w-9 h-9 rounded-full bg-surface-2 dark:bg-white/5 flex items-center justify-center hover:bg-brand-500 hover:text-white transition-all group"
                                    title="Cuentas en espera"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2m9-.828l-1.414-1.414M3.707 18.293V21h2.707l14.586-14.586a2 2 0 10-2.828-2.828L3.707 18.293z" /></svg>
                                    {heldCarts.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-500 text-brand-900 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-[#0c0c0c]">
                                            {heldCarts.length}
                                        </span>
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowCierre(true)}
                                    className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-4 py-2 rounded-full cursor-pointer hover:bg-green-500/20 transition-all group"
                                >
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse group-hover:scale-125 transition-transform" />
                                    <span className="text-[11px] font-black uppercase tracking-wide text-green-500">Sesión Abierta</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 px-4 py-2 bg-brand-500/10 rounded-2xl border border-brand-500/20 overflow-visible w-full">
                            <span className="text-xs text-brand-500 shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-wide text-brand-500 opacity-60 mb-0.5">ALMACÉN DE VENTA</div>
                                <CustomSelect
                                    value={activeWarehouse?.id || ""}
                                    onChange={val => {
                                        const wh = employeeWarehouses.find(w => w.id === parseInt(val));
                                        if (wh) switchWarehouse(wh);
                                    }}
                                    options={employeeWarehouses.map(w => ({ value: String(w.id), label: w.name }))}
                                    placeholder="Seleccionar Almacén"
                                    className="w-full !p-0 !bg-transparent !border-none !text-[11px]"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 relative">
                        <div className="relative group">
                            {selectedCustomer ? (
                                <div className="flex items-center justify-between px-4 bg-brand-500/10 border border-brand-500/20 rounded-xl">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-xl text-brand-500">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        </span>
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-black uppercase tracking-wide text-brand-500">Cliente</div>
                                            <div className="text-sm font-black text-content dark:text-white truncate">{selectedCustomer.name}</div>
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedCustomer(null)} className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-white transition-all shrink-0">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <input
                                        id="customer-search-input"
                                        spellCheck={false}
                                        autoComplete="off"
                                        value={custSearch}
                                        onChange={e => setCustSearch(e.target.value)}
                                        placeholder="BUSCAR CLIENTE... (F2)"
                                        className="input !pl-10 relative z-10"
                                    />
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-content-subtle opacity-60 z-20 pointer-events-none">
                                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    </div>
                                    <button onClick={() => { setCustomerEditData({ _fromCobro: true }); setCustomerModal(true); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-white transition-colors flex items-center justify-center text-xl font-bold z-20">+</button>
                                </>
                            )}
                            {!selectedCustomer && customers.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-xl shadow-2xl z-[100] max-h-56 overflow-y-auto">
                                    {customers.map((c, idx) => (
                                        <button 
                                            key={c.id} 
                                            onClick={() => { setSelectedCustomer(c); setCustomers([]); setCustSearch(""); setSelectedCustIdx(-1); }} 
                                            onMouseEnter={() => setSelectedCustIdx(idx)}
                                            className={`w-full text-left px-4 py-2 cursor-pointer border-b border-border/50 dark:border-border-dark/50 transition-colors group flex flex-col
                                                ${idx === selectedCustIdx ? "bg-brand-500/20 border-l-4 border-l-brand-500" : "hover:bg-surface-3 dark:hover:bg-surface-dark-3"}`}
                                        >
                                            <div className="text-sm font-bold text-brand-500 dark:text-brand-400 truncate">{c.name}</div>
                                            <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-0.5">{c.rif || "Sin datos adicionales"}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <div className="flex-1 bg-surface-1 dark:bg-white/5 rounded-2xl flex items-center px-4 gap-2 border border-black/5 dark:border-white/5">
                                <span className="text-xs opacity-40">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </span>
                                <CustomSelect
                                    value={currentCurrency?.id || ""}
                                    onChange={val => setSelectedCurrency(activeCurrencies.find(x => x.id === parseInt(val)))}
                                    options={activeCurrencies.map(c => ({ value: c.id, label: c.code }))}
                                    className="!p-0 !bg-transparent !border-none !text-[11px] flex-1"
                                />
                            </div>
                            <div className="flex-1 bg-surface-1 dark:bg-white/5 rounded-2xl flex items-center px-4 gap-2 border border-black/5 dark:border-white/5">
                                <span className="text-xs opacity-40">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                </span>
                                <CustomSelect
                                    value={selectedSerieId || ""}
                                    onChange={val => selectSerie(parseInt(val))}
                                    options={mySeries.map(s => ({ value: s.id, label: s.name }))}
                                    placeholder="SERIE..."
                                    className="!p-0 !bg-transparent !border-none !text-[11px] flex-1"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide pt-2">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-30 gap-3 py-8">
                                <div className="w-14 h-14 rounded-2xl bg-surface-2 dark:bg-white/5 flex items-center justify-center text-content-subtle opacity-20">
                                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                </div>
                                <div className="text-[11px] font-black tracking-wide uppercase text-center dark:text-white">Inicia una venta</div>
                            </div>
                        ) : (
                            cart.map(i => (
                                <div key={i.id} className="bg-surface-1 dark:bg-white/5 p-3 rounded-[24px] flex items-center gap-3 group transition-all border border-black/5 dark:border-white/5">
                                    <div className="w-12 h-12 rounded-xl bg-surface-2 dark:bg-white/5 flex items-center justify-center text-xl shrink-0 overflow-hidden relative">
                                        {i.image_url ? <img src={i.image_url} className="w-full h-full object-cover" /> : <div className="text-sm opacity-20 dark:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>}
                                        <button onClick={() => removeFromCart(i.id)} className="absolute inset-0 bg-danger/80 text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[11px] font-black truncate dark:text-white uppercase tracking-wide leading-tight">{i.name}</div>
                                        <div className="text-[11px] font-black text-brand-500 mt-0.5">{fmt(convertToDisplay(i.price), currSym)}</div>
                                    </div>
                                    <div className="flex items-center bg-surface-2 dark:bg-black/20 p-1 rounded-xl border border-black/5 dark:border-white/5 shrink-0">
                                        <button onClick={() => changeQty(i.id, -1)} className="w-7 h-7 rounded-lg font-black dark:text-white hover:bg-white/10">-</button>
                                        <input
                                            id={`qty-input-${i.id}`}
                                            type="number"
                                            value={i.qty}
                                            onChange={e => setQtyDirect(i.id, e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    searchInputRef.current?.focus();
                                                }
                                            }}
                                            className="w-10 bg-transparent text-center text-[11px] font-black border-none outline-none dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
                                        />
                                        <button onClick={() => changeQty(i.id, 1)} className="w-7 h-7 rounded-lg font-black dark:text-white hover:bg-white/10">+</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="pt-3 border-t border-border/10 space-y-2">
                        <div className="bg-surface-1 dark:bg-white/5 rounded-xl p-3 flex items-center justify-between gap-3 border border-black/5 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setDiscountEnabled(!discountEnabled)} className={`w-10 h-6 rounded-full transition-all relative ${discountEnabled ? "bg-brand-500" : "bg-surface-3 dark:bg-white/10"}`}>
                                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${discountEnabled ? "translate-x-4" : ""}`} />
                                </button>
                                <span className="text-[11px] font-black uppercase tracking-wide opacity-60 dark:text-content-dark-muted">Dto. Global</span>
                            </div>
                            {discountEnabled && (
                                <div className="relative w-24">
                                    <input type="number" min="0" max="100" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="0" className="w-full bg-surface-2 dark:bg-white/10 h-8 rounded-lg px-3 text-right text-xs font-black outline-none focus:ring-2 focus:ring-brand-500/20 dark:text-white" />
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-black opacity-30 dark:text-white">%</span>
                                </div>
                            )}
                        </div>
                        <div className="bg-surface-1 dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/10">
                            <div className="space-y-2 mb-4">
                                <div className="flex justify-between items-center opacity-60 dark:text-content-dark-muted">
                                    <span className="text-[11px] font-black uppercase tracking-wide">SUBTOTAL</span>
                                    <span className="text-xs font-black tracking-tight tabular-nums">{fmt(convertToDisplay(subtotalBase), currSym)}</span>
                                </div>
                                {discountEnabled && discountAmount > 0 && (
                                    <div className="flex justify-between items-center text-brand-500">
                                        <span className="text-[11px] font-black uppercase tracking-wide">DESC. ({discountPct}%)</span>
                                        <span className="text-xs font-black tracking-tight tabular-nums">-{fmt(convertToDisplay(discountAmount), currSym)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-[11px] font-black text-brand-500 uppercase tracking-wide">TOTAL</span>
                                <div className="text-2xl font-black tracking-tighter tabular-nums font-display dark:text-white">{fmt(totalDisplay, currSym)}</div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={holdCart} 
                                disabled={cart.length === 0}
                                className="w-14 h-14 rounded-2xl bg-surface-2 dark:bg-white/5 flex items-center justify-center hover:bg-brand-500 hover:text-white transition-all disabled:opacity-30 shrink-0"
                                title="Poner en espera"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2m9-.828l-1.414-1.414M3.707 18.293V21h2.707l14.586-14.586a2 2 0 10-2.828-2.828L3.707 18.293z" /></svg>
                            </button>
                            <button onClick={() => setShowConfirmCheckout(true)} disabled={loading || cart.length === 0} className="flex-1 bg-brand-500 text-brand-900 py-3.5 rounded-2xl font-black uppercase tracking-wide shadow-xl shadow-brand-500/20 active:scale-95 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                {loading ? "PROCESANDO..." : "FINALIZAR VENTA"}
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            <main className={`flex-1 flex-col p-4 overflow-hidden order-1 lg:order-2 ${mobileTab === 'products' ? 'flex' : 'hidden'} lg:flex`}>
                {/* Mobile toggle: Catálogo / Carrito */}
                <div className="lg:hidden flex items-center gap-2 mb-3">
                    <button onClick={() => setMobileTab("products")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${mobileTab === "products" ? "bg-brand-500 text-white" : "bg-white dark:bg-white/5 text-content-subtle"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                        Catálogo
                    </button>
                    <button onClick={() => setMobileTab("cart")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all relative ${mobileTab === "cart" ? "bg-brand-500 text-white" : "bg-white dark:bg-white/5 text-content-subtle"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        Carrito
                        {cart.length > 0 && (
                            <span className="w-4 h-4 bg-danger text-white text-[11px] font-black rounded-full flex items-center justify-center">{cart.length}</span>
                        )}
                    </button>
                </div>
                {/* Barra de búsqueda + filtro de categoría */}
                <div className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle opacity-40 pointer-events-none">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <input
                            ref={searchInputRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(0); }
                            }}
                            placeholder="Buscar producto... (F1)"
                            className="input !pl-10 w-full"
                        />
                    </div>
                    <div className="relative shrink-0">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 z-10 w-4 h-4 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                        </div>
                        <CustomSelect
                            value={selectedCat}
                            onChange={val => setSelectedCat(val)}
                            options={[
                                { value: "all", label: "Todas las categorías" },
                                ...categories.map(cat => ({ value: cat.name, label: cat.name }))
                            ]}
                            className="!pl-9 min-w-[140px] !text-[11px] font-black uppercase tracking-wide h-10"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 pb-4 scrollbar-hide">
                    <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                        {filteredProducts.map((p, idx) => {
                            const outOfStock = !p.is_service && (p.stock ?? 0) <= 0;
                            const isSelected = idx === selectedIndex;
                            return (
                                <div key={p.id}
                                    onClick={() => !outOfStock && addToCart(p)}
                                    className={`group bg-white dark:bg-surface-dark-2 rounded-xl overflow-hidden transition-all shadow border-2 
                                        ${isSelected ? "border-brand-500 shadow-lg shadow-brand-500/20 scale-105 z-10" : "border-transparent"}
                                        ${outOfStock ? "opacity-40 cursor-not-allowed" : "hover:-translate-y-0.5 cursor-pointer hover:border-brand-500/50"}`}
                                >
                                    <div className="aspect-[4/3] bg-surface-1 dark:bg-white/5 relative overflow-hidden">
                                        {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10 dark:text-white"><svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>}
                                        {outOfStock && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="bg-black/60 text-white text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full">Sin stock</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 flex flex-col gap-1">
                                        <div className="text-[11px] font-black text-brand-500 uppercase tracking-wide truncate">{p.category_name || "Sin Categoría"}</div>
                                        <div className="text-xs font-black line-clamp-2 dark:text-white uppercase tracking-wide leading-tight">{p.name}</div>
                                        <div className="text-sm font-black dark:text-white font-display">{fmt(convertToDisplay(p.price), currSym)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                {/* Legend - Atajos de teclado */}
                <div className="px-6 py-3 border-t border-border/40 dark:border-white/5 bg-surface-1 dark:bg-white/[0.02] flex gap-5 overflow-x-auto scrollbar-hide shrink-0 rounded-b-[40px] mt-auto">
                    {[
                        { k: 'F1', l: 'Buscar' },
                        { k: 'F2', l: 'Cliente' },
                        { k: 'F4', l: 'Pausar' },
                        { k: 'F10', l: 'Cobrar' },
                        { k: 'Esc', l: 'Limpiar' },
                    ].map(s => (
                        <div key={s.k} className="flex items-center gap-2 shrink-0">
                            <kbd className="px-2 py-0.5 rounded-lg bg-white dark:bg-white/10 border-b-2 border-black/10 dark:border-white/10 text-[10px] font-black text-brand-500 shadow-sm">{s.k}</kbd>
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-40 dark:text-white">{s.l}</span>
                        </div>
                    ))}
                </div>
            </main>


            <CustomerModal open={customerModal} onClose={() => setCustomerModal(false)} onSave={saveCustomer} />
            <HeldCartsModal 
                open={showHeldModal} 
                onClose={() => setShowHeldModal(false)} 
                carts={heldCarts} 
                onTake={(id) => { takeHeldCart(id); setShowHeldModal(false); }}
                onRemove={removeHeldCart}
                baseCurrency={baseCurrency}
            />
            {showApertura && (
                <AperturaCajaModal
                    employee={employee}
                    warehouses={employeeWarehouses}
                    initialWarehouse={activeWarehouse}
                    onWarehouseChange={(val) => {
                        const wh = employeeWarehouses.find(w => w.id === parseInt(val));
                        if (wh) switchWarehouse(wh);
                    }}
                    onOpened={(session) => {
                        setCashSession(session);
                        setShowApertura(false);
                        const wh = employeeWarehouses.find(w => w.id === session.warehouse_id);
                        if (wh) switchWarehouse(wh);
                    }}
                />
            )}
            <ConfirmModal isOpen={showConfirmCheckout} title="Venta" message="¿Realizar cobro?" onConfirm={() => { setShowConfirmCheckout(false); checkout(); }} onCancel={() => setShowConfirmCheckout(false)} type="primary" confirmText="Procesar" cancelText="Atrás" />

            {showCierre && cashSession && (
                <CierreCajaModal
                    session={cashSession}
                    onClosed={() => { setCashSession(null); setShowCierre(false); setShowApertura(true); }}
                    onCancel={() => setShowCierre(false)}
                />
            )}
        </div>
    );
}
