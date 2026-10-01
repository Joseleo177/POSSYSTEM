import { useState } from "react";
import CustomSelect from "../ui/CustomSelect";
import CustomerModal from "../Customers/CustomerModal";
import { fmtQtyUnit } from "../../helpers/unitFormatter";
import { resolveImageUrl, imgRetryOnError, toNameCase } from "../../helpers";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";

export default function CartSidebar({
    mobileTab, setMobileTab,
    cart, addToCart, removeFromCart, changeQty, setQtyDirect,
    subtotalBase, discountAmount, discountEnabled, setDiscountEnabled,
    discountPct, setDiscountPct, discountMode, setDiscountMode,
    totalDisplay, totalSecondary,
    subtotalDisplay, promoDiscountDisplay, discountAmountDisplay, promoLineDiscountDisplay,
    chargeEnabled, setChargeEnabled, chargeLabel, setChargeLabel, chargeMode, setChargeMode,
    chargeInput, setChargeInput, setChargeFromPct,
    chargeAmountDisplay = 0, chargePct = 0,
    convertToDisplay, convertToSecondary, currSym, secondaryCurrency, fmt,
    currentCurrency, setSelectedCurrency, activeCurrencies,
    selectedSerieId, selectSerie, mySeries,
    activeWarehouse,
    selectedCustomer, setSelectedCustomer,
    custSearch, setCustSearch, customers, setCustomers, pickCustomer,
    selectedCustIdx, setSelectedCustIdx,
    setCustomerEditData, setCustomerModal,
    cashSession, setShowCierre, setShowApertura, setShowHeldModal, heldCarts, setShowPendingSales,
    loading, setShowConfirmCheckout, holdCart,
    openQtyModal,
    searchInputRef,
    activePromos = [], promoLineDiscount, promoDiscount = 0,
}) {
    // Mismo redondeo por línea que CartContext, para que las líneas sumen el total del footer.
    const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

    // Si lo tecleado en el buscador es solo un documento (dígitos, con prefijo opcional
    // tipo V- o J-), lo llevamos al campo cédula/RIF del alta en vez de al nombre.
    // Edición del cliente ya elegido, sin abandonar la venta.
    const { can, notify } = useApp();
    const canPending = can("sales.pending");
    const [editandoCliente, setEditandoCliente] = useState(false);
    const [guardandoCliente, setGuardandoCliente] = useState(false);

    const guardarCliente = async (payload) => {
        setGuardandoCliente(true);
        try {
            const r = await api.customers.update(selectedCustomer.id, payload);
            // El carrito se queda con los datos nuevos: si se corrigió la cédula, la factura
            // debe salir con esa y no con la que estaba cargada al elegir al cliente.
            setSelectedCustomer({ ...selectedCustomer, ...(r.data || payload) });
            notify("Datos del cliente actualizados");
            setEditandoCliente(false);
        } catch (e) { notify(e.message, "err"); }
        setGuardandoCliente(false);
    };

    const buildNewCustomer = (q) => {
        const txt = (q || "").trim();
        const doc = txt.match(/^([VEJGP])?-?(\d+)$/i);
        return doc
            ? { name: "", rif: `${(doc[1] || "V").toUpperCase()}-${doc[2]}`, _fromCobro: true }
            : { name: txt, _fromCobro: true };
    };

    const handleQtyModal = (item) => {
        // En móviles, disparamos el modal. En desktop, el input inline es suficiente pero el modal no estorba.
        if (window.innerWidth < 1024) {
            openQtyModal(item);
        }
    };
    return (
        <aside className={`w-full h-full lg:w-[360px] bg-white dark:bg-[#0c0c0c] flex-col border-b lg:border-r border-border dark:border-white/5 shadow-[20px_0_60px_rgba(0,0,0,0.03)] z-20 shrink-0 order-2 lg:order-1 relative ${mobileTab === "cart" ? "flex" : "hidden"} lg:flex`}>
            <div className="p-3 space-y-2 flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden scrollbar-hide">

                {/* Mobile toggle */}
                <div className="lg:hidden flex items-center gap-2">
                    <button onClick={() => setMobileTab("products")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[12px] font-bold transition-all ${mobileTab === "products" ? "bg-brand-500 text-white" : "bg-surface-2 dark:bg-white/5 text-content-subtle"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                        Catálogo
                    </button>
                    <button onClick={() => setMobileTab("cart")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[12px] font-bold transition-all relative ${mobileTab === "cart" ? "bg-brand-500 text-white" : "bg-surface-2 dark:bg-white/5 text-content-subtle"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        Carrito
                        {cart.length > 0 && <span className="w-4 h-4 bg-danger text-white text-[12px] font-bold rounded-full flex items-center justify-center">{cart.length}</span>}
                    </button>
                </div>

                {/* Acciones de sesión (escritorio). Sin título "POS · Punto de venta": el
                    módulo ya se nombra en la barra superior, y el título le quitaba ancho a estos
                    tres botones hasta montarlos unos sobre otros. Ahora van en una fila pareja. */}
                <div className={`hidden lg:grid ${canPending ? "grid-cols-3" : "grid-cols-2"} gap-1.5`}>
                    {cashSession ? (
                        <>
                            {/* Facturas pendientes: con permiso propio (sales.pending). Sin él
                                la fila queda en dos botones en vez de dejar un hueco. */}
                            {canPending && (
                                <button
                                    onClick={() => setShowPendingSales(true)}
                                    className="btn-outline h-10 px-2 rounded-lg flex items-center justify-center gap-1.5 text-[12px] font-semibold active:scale-[0.98] min-w-0"
                                    title="Facturas pendientes (F5)"
                                >
                                    <svg className="w-4 h-4 shrink-0 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                    <span className="truncate">Pendientes</span>
                                </button>
                            )}

                            {/* Cuentas en espera */}
                            <button
                                onClick={() => setShowHeldModal(true)}
                                className="btn-outline relative h-10 px-2 rounded-lg flex items-center justify-center gap-1.5 text-[12px] font-semibold active:scale-[0.98] min-w-0"
                                title="Cuentas en espera (F3)"
                            >
                                <svg className="w-4 h-4 shrink-0 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span className="truncate">En espera</span>
                                {/* Burbuja en la esquina y no dentro del botón: dentro le quitaba
                                    ancho a la etiqueta y "En espera" salía cortado. */}
                                {heldCarts.length > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-brand-ink text-[11px] font-bold flex items-center justify-center tabular-nums ring-2 ring-white dark:ring-surface-dark">{heldCarts.length}</span>
                                )}
                            </button>

                            {/* Caja abierta → cierre. El punto verde es el estado; la segunda
                                línea dice qué hace el botón. */}
                            <button
                                onClick={() => setShowCierre(true)}
                                className="h-10 px-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 flex flex-col items-center justify-center transition-colors active:scale-[0.98] min-w-0"
                                title="Cerrar turno"
                            >
                                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 leading-none">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                    Caja abierta
                                </span>
                                <span className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70 leading-none mt-1">Cerrar turno</span>
                            </button>
                        </>
                    ) : (
                        /* Caja cerrada → apertura: es lo único que se puede hacer, ocupa la fila. */
                        <button
                            onClick={() => setShowApertura(true)}
                            className="col-span-full btn-accent h-10 rounded-lg flex items-center justify-center gap-2 text-[13px] font-semibold active:scale-[0.98]"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                            Abrir turno
                        </button>
                    )}
                </div>

                {/* Almacén activo: solo informativo, se elige al abrir caja (AperturaCajaModal).
                    Línea de ancho completo para que el nombre no se corte. */}
                <div className="hidden lg:flex items-center gap-1.5 min-w-0 text-[12px]">
                    <svg className="w-3.5 h-3.5 text-content-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    <span className="text-content-subtle shrink-0">Sucursal</span>
                    <span className="font-semibold text-content dark:text-white truncate">{toNameCase(activeWarehouse?.name) || "Sin sucursal"}</span>
                </div>

                {/* Acciones de sesión en móvil. Antes esta barra solo tenía "en espera" y un
                    indicador de estado que era un div: faltaba el acceso a facturas pendientes
                    y, sobre todo, no había forma de cerrar la caja desde el teléfono —el resto
                    de acciones vive en el bloque hidden lg:flex de arriba—. */}
                <div className="lg:hidden flex items-center justify-between gap-2 pb-1">
                    <span className="text-[12px] text-content-subtle truncate min-w-0" title="Sucursal de venta">{activeWarehouse ? <>Sucursal <span className="font-semibold text-content dark:text-white">{toNameCase(activeWarehouse.name)}</span></> : "Sin sucursal"}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {cashSession ? (
                            <>
                                {canPending && (
                                    <button
                                        onClick={() => setShowPendingSales(true)}
                                        className="h-9 px-4 rounded-xl bg-surface-2 dark:bg-white/5 text-content-subtle dark:text-white/40 flex items-center justify-center active:scale-90 transition-all"
                                        title="Facturas pendientes"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                    </button>
                                )}

                                <button
                                    onClick={() => setShowHeldModal(true)}
                                    className="relative h-9 px-4 rounded-xl bg-surface-2 dark:bg-white/5 text-content-subtle dark:text-white/40 flex items-center justify-center active:scale-90 transition-all"
                                    title="Cuentas en espera"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m9-.828l-1.414-1.414M3.707 18.293V21h2.707l14.586-14.586a2 2 0 10-2.828-2.828L3.707 18.293z" /></svg>
                                    {heldCarts.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-[#0c0c0c]">{heldCarts.length}</span>}
                                </button>

                                {/* Botón, no indicador: es el único acceso al cierre de turno en móvil. */}
                                <button
                                    onClick={() => setShowCierre(true)}
                                    className="btn-outline h-9 px-3 rounded-xl flex items-center gap-1.5 active:scale-95"
                                    title="Cerrar turno"
                                >
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                    <span className="text-[12px] font-medium whitespace-nowrap">Cerrar turno</span>
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setShowApertura(true)}
                                className="btn-accent h-9 px-3.5 rounded-xl flex items-center gap-1.5 active:scale-95"
                                title="Abrir turno"
                            >
                                <span className="text-[12px] font-semibold whitespace-nowrap">Abrir turno</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Cliente */}
                <div className="space-y-4 relative">
                    <div className="relative group">
                        {selectedCustomer ? (
                            <div className="flex items-center justify-between px-4 py-2 bg-brand-500/10 border border-brand-500/20 rounded-xl">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-xl text-brand-500">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    </span>
                                    {/* La cédula manda: es el dato que se verifica al facturar, así que
                                        va arriba y con el peso visual. El nombre queda de apoyo. */}
                                    <div className="min-w-0">
                                        {selectedCustomer.rif ? (
                                            <>
                                                <div className="text-sm font-bold tracking-wide text-content dark:text-white truncate">{selectedCustomer.rif}</div>
                                                <div className="text-[12px] font-bold text-brand-600 dark:text-brand-400 truncate">{selectedCustomer.name}</div>
                                            </>
                                        ) : (
                                            <div className="text-sm font-bold text-content dark:text-white truncate">{selectedCustomer.name}</div>
                                        )}
                                    </div>
                                </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {/* Corregir la cédula o completar los datos sin salir de la venta:
                                    el error se descubre justo al facturar, y hasta ahora había que
                                    quitar el cliente, irse al módulo de Clientes y volver. */}
                                {can("customers.edit") && (
                                    <button
                                        onClick={() => setEditandoCliente(true)}
                                        title="Editar datos del cliente"
                                        className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-brand-500/20 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-white transition-all"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                )}
                                <button onClick={() => setSelectedCustomer(null)} title="Quitar cliente" className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-brand-500/20 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-white transition-all">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <input
                                id="customer-search-input"
                                spellCheck={false}
                                autoComplete="off"
                                value={custSearch}
                                onChange={e => { setCustSearch(e.target.value); setSelectedCustIdx(-1); }}
                                onKeyDown={e => {
                                    if (!custSearch.trim()) return;
                                    const total = customers.length + 1; // +1 for "Crear"
                                    if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        setSelectedCustIdx(i => Math.min(i + 1, total - 1));
                                    } else if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        setSelectedCustIdx(i => Math.max(i - 1, -1));
                                    } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (selectedCustIdx >= 0 && selectedCustIdx < customers.length) {
                                            pickCustomer(customers[selectedCustIdx]);
                                        } else if (selectedCustIdx === customers.length || customers.length === 0) {
                                            setCustomerEditData(buildNewCustomer(custSearch)); setCustomerModal(true); setCustSearch(""); setSelectedCustIdx(-1);
                                        } else if (customers.length === 1) {
                                            pickCustomer(customers[0]);
                                        }
                                    } else if (e.key === "Escape") {
                                        setCustSearch(""); setSelectedCustIdx(-1);
                                    }
                                }}
                                placeholder="Cliente... (F2)"
                                className="input !h-10 !pl-10 relative z-10 !text-xs"
                            />
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-content-subtle opacity-60 z-20 pointer-events-none">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </>
                    )}
                    {!selectedCustomer && custSearch.trim().length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 p-1 bg-white dark:bg-surface-dark-2 border border-black/[0.07] dark:border-white/10 rounded-xl shadow-[0_12px_40px_-8px_rgb(0_0_0/0.22)] z-[100] popover-in max-h-64 overflow-y-auto">
                            {/* Resaltado con velo de marca y nombre en tinta: el nombre en cian y
                                un borde grueso a la izquierda competían con el propio buscador. */}
                            {customers.map((c, idx) => (
                                <button
                                    key={c.id}
                                    onClick={() => pickCustomer(c)}
                                    onMouseEnter={() => setSelectedCustIdx(idx)}
                                    className={`w-full text-left px-3 py-2 rounded-lg cursor-pointer transition-colors flex flex-col ${idx === selectedCustIdx ? "bg-brand-500/10" : "hover:bg-surface-2 dark:hover:bg-white/[0.04]"}`}
                                >
                                    <div className={`text-[14px] font-semibold truncate ${idx === selectedCustIdx ? "text-brand-700 dark:text-brand-300" : "text-content dark:text-white"}`}>{toNameCase(c.name)}</div>
                                    <div className="text-[12px] text-content-subtle tabular-nums">{c.rif || "Sin documento"}</div>
                                </button>
                            ))}
                            <button
                                onClick={() => { setCustomerEditData(buildNewCustomer(custSearch)); setCustomerModal(true); setCustSearch(""); setSelectedCustIdx(-1); }}
                                className={`w-full text-left px-3 py-2.5 mt-0.5 rounded-lg cursor-pointer text-[13px] font-semibold text-brand-700 dark:text-brand-300 flex items-center gap-2.5 transition-colors ${customers.length > 0 ? "border-t border-border/60 dark:border-white/[0.06] rounded-t-none" : ""} ${selectedCustIdx === customers.length ? "bg-brand-500/10" : "hover:bg-surface-2 dark:hover:bg-white/[0.04]"}`}
                            >
                                <span className="w-6 h-6 rounded-md bg-brand-500/10 flex items-center justify-center shrink-0">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" /></svg>
                                </span>
                                <span className="truncate">Crear cliente «{custSearch}»</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Moneda + Serie */}
                <div className="flex gap-2 lg:gap-3">
                    <div className="flex-1 bg-surface-2 dark:bg-white/5 rounded-xl lg:rounded-2xl flex items-center px-3 lg:px-4 gap-2 border border-black/5 dark:border-white/5">
                        <span className="text-xs opacity-40">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </span>
                        <CustomSelect
                            value={currentCurrency?.id || ""}
                            onChange={val => setSelectedCurrency(activeCurrencies.find(x => x.id === parseInt(val)))}
                            options={activeCurrencies.map(c => ({ value: c.id, label: c.code }))}
                            className="!p-0 !bg-transparent !border-none !text-[11px] font-bold flex-1"
                        />
                    </div>
                    <div className="flex-1 bg-surface-2 dark:bg-white/5 rounded-xl lg:rounded-2xl flex items-center px-3 lg:px-4 gap-2 border border-black/5 dark:border-white/5">
                        <span className="text-xs opacity-40">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </span>
                        <CustomSelect
                            value={selectedSerieId || ""}
                            onChange={val => selectSerie(parseInt(val))}
                            options={mySeries.map(s => ({ value: s.id, label: s.name }))}
                            placeholder="SERIE..."
                            className="!p-0 !bg-transparent !border-none !text-[11px] font-bold flex-1"
                        />
                    </div>
                </div>
            </div>

                {/* Ítems del carrito */}
                <div className="flex-1 lg:overflow-y-auto space-y-2 lg:space-y-3 scrollbar-hide pt-2">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-30 gap-3 py-8">
                            <div className="w-14 h-14 rounded-2xl bg-surface-2 dark:bg-white/5 flex items-center justify-center text-content-subtle opacity-20">
                                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                            </div>
                            <div className="text-[12px] font-bold text-center dark:text-white">Inicia una venta</div>
                        </div>
                    ) : (
                        cart.map(i => {
                            // Total de línea con el mismo redondeo por línea que usa el subtotal
                            // (round2 del precio en la moneda mostrada × qty), para que la suma
                            // de las líneas cuadre exacto con el total del footer.
                            const lineDiscount = promoLineDiscountDisplay ? promoLineDiscountDisplay(i) : 0;
                            const lineGross = round2(convertToDisplay(i.price)) * i.qty;
                            const lineTotal = lineGross - lineDiscount;
                            // La promo se aplica como proporción para no arrastrar el descuento
                            // de una moneda a la otra a través de la tasa.
                            const discountRatio = lineGross > 0 ? lineDiscount / lineGross : 0;
                            const lineTotalSecondary = secondaryCurrency
                                ? round2(convertToSecondary(i.price)) * i.qty * (1 - discountRatio)
                                : null;
                            return (
                            <div key={i.id} className="bg-surface-2 dark:bg-white/5 p-2.5 lg:p-3 rounded-2xl flex items-center gap-3 group transition-all border border-black/5 dark:border-white/5">
                                <div className="w-12 h-12 rounded-xl bg-surface-2 dark:bg-white/5 flex items-center justify-center shrink-0 overflow-hidden relative">
                                    {i.image_url ? <img src={resolveImageUrl(i.image_url)} className="w-full h-full object-cover" alt={i.name} onError={imgRetryOnError} /> :<div className="text-sm opacity-20 dark:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>}
                                    <button onClick={() => removeFromCart(i.id)} className="absolute inset-0 bg-danger/80 text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                                <div 
                                    className="flex-1 min-w-0 cursor-pointer lg:cursor-default"
                                    onClick={() => handleQtyModal(i)}
                                >
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {/* El nombre se lee entero: truncado, "SARDINA INCOSA T..." no
                                            distingue una presentación de otra en pleno cobro. */}
                                        <div className="text-[12px] font-bold dark:text-white leading-tight break-words min-w-0 flex-1">{i.name}</div>
                                        {activePromos.find(p => p.product_ids?.includes(i.id)) && (() => {
                                            const promo = activePromos.find(p => p.product_ids?.includes(i.id));
                                            return (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/20 shrink-0">
                                                    {promo.type === 'percentage' ? `-${promo.discount_pct}%` : `${promo.buy_qty}×${promo.buy_qty + promo.get_qty}`}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <div className="flex flex-col mt-0.5">
                                        <div className="text-[11px] text-content-subtle tabular-nums flex items-center gap-1 flex-wrap">
                                            <span>{fmtQtyUnit(i.qty, i.unit).toLowerCase()}</span>
                                            <span className="opacity-40">×</span>
                                            <span>{fmt(convertToDisplay(i.price), currSym)}</span>
                                            {lineDiscount > 0 && (
                                                <span className="text-success">-{fmt(lineDiscount, currSym)}</span>
                                            )}
                                        </div>
                                        {/* Los importes no se parten por dentro: si no caben juntos,
                                            el segundo baja completo a la línea siguiente. */}
                                        <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5">
                                            <span className="text-[12px] font-bold text-content dark:text-white leading-tight whitespace-nowrap tabular-nums">{fmt(lineTotal, currSym)}</span>
                                            {secondaryCurrency && (
                                                <span className="text-[12px] font-bold text-content dark:text-white leading-tight whitespace-nowrap tabular-nums">
                                                    {fmt(lineTotalSecondary, secondaryCurrency.symbol)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center bg-surface-2 dark:bg-black/20 p-1 rounded-xl border border-black/5 dark:border-white/5 shrink-0">
                                    <button onClick={() => changeQty(i.id, -1)} className="hidden lg:block w-7 h-7 rounded-lg font-bold dark:text-white hover:bg-white/10">-</button>
                                    <input
                                        id={`qty-input-${i.id}`}
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        value={i.qty}
                                        readOnly={window.innerWidth < 1024}
                                        onClick={() => handleQtyModal(i)}
                                        onChange={e => setQtyDirect(i.id, e.target.value)}
                                        onBlur={() => {
                                            // Vacío y cero se permiten MIENTRAS se escribe —hacen
                                            // falta para teclear "0,5"—, pero al salir del campo la
                                            // línea no puede quedarse en cero: vuelve al mínimo.
                                            const q = parseFloat(i.qty);
                                            if (!(q > 0)) setQtyDirect(i.id, String(parseFloat(i.qty_step) || 1), true);
                                        }}
                                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); searchInputRef.current?.focus(); } }}
                                        className="w-10 bg-transparent text-center text-[12px] font-bold border-none outline-none dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-pointer lg:cursor-text"
                                    />
                                    <button onClick={() => changeQty(i.id, 1)} className="hidden lg:block w-7 h-7 rounded-lg font-bold dark:text-white hover:bg-white/10">+</button>
                                </div>
                            </div>
                            );
                        })
                    )}
                </div>

                {/* Footer: descuento + totales + botones */}
                <div className="sticky bottom-0 z-10 -mx-3 -mb-3 px-3 pb-3 lg:static lg:mx-0 lg:mb-0 lg:px-0 lg:pb-1 bg-white dark:bg-[#0c0c0c] pt-2 border-t border-border/60 dark:border-white/[0.06] space-y-1.5">
                    {/* Móvil: descuento y recargo en una fila de dos botones; sus controles
                        aparecen solo al activarlos. Dos franjas fijas se comían la pantalla. */}
                    <div className="lg:hidden grid grid-cols-2 gap-1.5">
                        {[["Descuento", discountEnabled, () => setDiscountEnabled(!discountEnabled)], ["Recargo", chargeEnabled, () => setChargeEnabled(!chargeEnabled)]].map(([label, on, fn]) => (
                            <button key={label} onClick={fn} className={`h-9 rounded-lg text-[13px] font-medium border flex items-center justify-center gap-1.5 transition-colors ${on ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "bg-white dark:bg-white/5 border-border dark:border-white/10 text-content-muted dark:text-white/70"}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={on ? "M5 13l4 4L19 7" : "M12 5v14M5 12h14"} /></svg>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className={`${discountEnabled ? "flex" : "hidden lg:flex"} bg-surface-2 dark:bg-white/5 rounded-lg p-2 items-center justify-between gap-3 border border-black/5 dark:border-white/5`}>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setDiscountEnabled(!discountEnabled)} className={`w-8 h-5 lg:w-10 lg:h-6 rounded-full transition-all relative ${discountEnabled ? "bg-brand-500" : "bg-surface-3 dark:bg-white/10"}`}>
                                <div className={`absolute top-0.5 lg:top-1 left-0.5 lg:left-1 w-4 h-4 bg-white rounded-full transition-all ${discountEnabled ? "translate-x-3 lg:translate-x-4" : ""}`} />
                            </button>
                            <span className="text-[13px] font-medium text-content-muted dark:text-white/70">Descuento</span>
                        </div>
                        {discountEnabled && (
                            <div className="flex items-center gap-1.5">
                                {/* Porcentaje o monto fijo: "el 10%" y "déjalo en 5 menos" son
                                    los dos descuentos que se piden en el mostrador, y el
                                    segundo obligaba a calcular el porcentaje de cabeza. Dos
                                    botones y no un desplegable: son dos opciones y el cajero
                                    las alterna de un toque. */}
                                <div className="flex rounded-lg overflow-hidden border border-black/10 dark:border-white/10">
                                    {[["pct", "%"], ["amount", currentCurrency?.symbol || "Ref."]].map(([modo, etiqueta]) => (
                                        <button
                                            key={modo}
                                            onClick={() => { setDiscountMode(modo); setDiscountPct(""); }}
                                            className={`h-7 lg:h-8 px-2 text-[11px] font-bold transition-all ${discountMode === modo
                                                ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-500/40"
                                                : "bg-surface-2 dark:bg-white/10 text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white"}`}
                                        >
                                            {etiqueta}
                                        </button>
                                    ))}
                                </div>
                                <div className="w-16 lg:w-20">
                                    <input
                                        type="number" min="0" step={discountMode === "pct" ? "1" : "0.01"}
                                        max={discountMode === "pct" ? "100" : undefined}
                                        value={discountPct}
                                        onChange={e => setDiscountPct(e.target.value)}
                                        placeholder={discountMode === "pct" ? "0" : "0.00"}
                                        className="w-full bg-surface-2 dark:bg-white/10 h-7 lg:h-8 rounded-lg px-2 text-right text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20 dark:text-white"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Recargo: propina, servicio, delivery. Se carga por MONTO en la moneda
                        que está en pantalla, y los atajos de porcentaje solo rellenan ese
                        monto, que el cajero puede seguir ajustando a mano. */}
                    <div className={`${chargeEnabled ? "" : "hidden lg:block"} bg-surface-2 dark:bg-white/5 rounded-lg p-2 space-y-2 border border-black/5 dark:border-white/5`}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setChargeEnabled(!chargeEnabled)} className={`w-8 h-5 lg:w-10 lg:h-6 rounded-full transition-all relative ${chargeEnabled ? "bg-brand-500" : "bg-surface-3 dark:bg-white/10"}`}>
                                    <div className={`absolute top-0.5 lg:top-1 left-0.5 lg:left-1 w-4 h-4 bg-white rounded-full transition-all ${chargeEnabled ? "translate-x-3 lg:translate-x-4" : ""}`} />
                                </button>
                                <span className="text-[13px] font-medium text-content-muted dark:text-white/70">Recargo</span>
                            </div>
                            {chargeEnabled && (
                                <div className="flex items-center gap-1.5">
                                    {/* Mismo selector que el descuento: la propina se pide de
                                        las dos formas —"el 10%" y "ponle 5 de servicio"— y con
                                        solo monto había que calcular el porcentaje de cabeza
                                        cada vez que cambiaba el consumo. */}
                                    <div className="flex rounded-lg overflow-hidden border border-black/10 dark:border-white/10">
                                        {[["pct", "%"], ["amount", currentCurrency?.symbol || "Ref."]].map(([modo, etiqueta]) => (
                                            <button
                                                key={modo}
                                                onClick={() => { setChargeMode(modo); setChargeInput(""); }}
                                                className={`h-7 lg:h-8 px-2 text-[11px] font-bold transition-all ${chargeMode === modo
                                                    ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-500/40"
                                                    : "bg-surface-2 dark:bg-white/10 text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white"}`}
                                            >
                                                {etiqueta}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="w-16 lg:w-20">
                                        <input
                                            type="number" min="0" inputMode="decimal"
                                            step={chargeMode === "pct" ? "1" : "0.01"}
                                            max={chargeMode === "pct" ? "100" : undefined}
                                            value={chargeInput}
                                            onChange={e => setChargeInput(e.target.value)}
                                            placeholder={chargeMode === "pct" ? "0" : "0.00"}
                                            className="w-full bg-surface-2 dark:bg-white/10 h-7 lg:h-8 rounded-lg px-2 text-right text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                        {chargeEnabled && (
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="text" maxLength={40}
                                    value={chargeLabel}
                                    onChange={e => setChargeLabel(e.target.value)}
                                    placeholder="Servicio"
                                    className="flex-1 min-w-0 bg-surface-2 dark:bg-white/10 h-7 rounded-lg px-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-brand-500/20 dark:text-white"
                                />
                                {[10, 15, 20].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setChargeFromPct(p)}
                                        className="h-7 px-2 rounded-lg bg-surface-2 dark:bg-white/10 text-[11px] font-bold text-content-subtle dark:text-content-dark-muted hover:bg-brand-500 hover:text-white transition-all shrink-0"
                                    >
                                        {p}%
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="bg-surface-2 dark:bg-white/5 p-3 rounded-xl border border-black/5 dark:border-white/10">
                        <div className={`${(promoDiscount > 0 || (discountEnabled && discountAmount > 0) || chargeAmountDisplay > 0) ? "" : "hidden lg:block"} space-y-1 mb-2`}>
                            <div className="flex justify-between items-center opacity-60 dark:text-content-dark-muted">
                                <span className="text-[12px] lg:text-[13px] font-medium">Subtotal</span>
                                <span className="text-[12px] lg:text-sm font-bold tabular-nums">{fmt(subtotalDisplay, currSym)}</span>
                            </div>
                            {promoDiscount > 0 && (
                                <div className="flex justify-between items-center text-success">
                                    <span className="text-[12px] lg:text-[13px] font-medium">Promociones</span>
                                    <span className="text-[12px] lg:text-sm font-bold tabular-nums">-{fmt(promoDiscountDisplay, currSym)}</span>
                                </div>
                            )}
                            {discountEnabled && discountAmount > 0 && (
                                <div className="flex justify-between items-center text-content-muted dark:text-white/70">
                                    {/* Por monto el "%" sobraba: el renglón ya muestra el importe
                                        descontado y repetirlo como porcentaje era falso. */}
                                    <span className="text-[12px] lg:text-[13px] font-medium">
                                        Descuento{discountMode === "pct" ? ` (${discountPct}%)` : ""}
                                    </span>
                                    <span className="text-[12px] lg:text-sm font-bold tabular-nums">-{fmt(discountAmountDisplay, currSym)}</span>
                                </div>
                            )}
                            {chargeAmountDisplay > 0 && (
                                <div className="flex justify-between items-center text-content dark:text-white">
                                    <span className="text-[12px] lg:text-[13px] font-medium truncate pr-2">
                                        {/* Un recargo simbólico frente a un consumo grande da
                                            0.0%: en ese caso no se rotula, en vez de mostrar
                                            un porcentaje que parece un error de cálculo. */}
                                        {chargeLabel?.trim() || "Servicio"}{chargePct >= 0.05 ? ` (${chargePct.toFixed(1)}%)` : ""}
                                    </span>
                                    <span className="text-[12px] lg:text-sm font-bold tabular-nums shrink-0">+{fmt(chargeAmountDisplay, currSym)}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between items-end">
                            <span className="text-[13px] font-semibold text-content dark:text-white shrink-0">Total</span>
                            <div className="flex flex-col items-end min-w-0">
                                <div className="text-2xl lg:text-3xl font-bold tracking-tighter tabular-nums font-display dark:text-white leading-none whitespace-nowrap">{fmt(totalDisplay, currSym)}</div>
                                {secondaryCurrency && (
                                    <div className="text-[12px] lg:text-sm font-medium text-content-subtle dark:text-white/50 tabular-nums mt-1 whitespace-nowrap">
                                        ≈ {fmt(totalSecondary, secondaryCurrency.symbol)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    {!cashSession && cart.length > 0 && (
                        <button
                            onClick={() => setShowApertura(true)}
                            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[12px] font-semibold hover:bg-amber-500/15 transition-colors"
                        >
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Caja cerrada · abre el turno para facturar
                        </button>
                    )}
                    <div className="flex gap-2">
                        {/* Pausar (F4) deja la cuenta en espera. Es un botón que se usa tanto
                            como finalizar: con 48px de ancho quedaba como un accesorio del otro y
                            en tablet se fallaba el toque. Antes era solo un lápiz y nadie adivinaba
                            qué hacía; ahora dice "Pausar", igual que el atajo de la leyenda. */}
                        <button
                            onClick={holdCart}
                            disabled={cart.length === 0}
                            title="Pausar la venta y dejarla en espera (F4)"
                            className="btn-outline h-12 px-4 rounded-xl flex items-center justify-center gap-2 text-[13px] font-semibold active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shrink-0"
                        >
                            <svg className="w-5 h-5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Pausar
                        </button>
                        {/* Deshabilitado va en gris y no en cian pálido: el cian apagado se leía
                            como un botón roto, no como "todavía no hay nada que cobrar".
                            Sin turno abierto sigue activo —desde aquí también se cotiza—, pero
                            facturar pide abrir la caja (ver onSelectFactura en CobroPage). */}
                        <button onClick={() => setShowConfirmCheckout(true)} disabled={loading || cart.length === 0} className="flex-1 h-12 rounded-xl text-[14px] font-semibold active:scale-[0.98] transition-all btn-accent disabled:!bg-surface-3 disabled:!bg-none disabled:!text-content-subtle disabled:!border-transparent disabled:!shadow-none dark:disabled:!bg-white/[0.06] disabled:cursor-not-allowed">
                            {loading ? "..." : "Finalizar venta"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mismo formulario que el módulo de Clientes: si cambian los campos de un cliente,
                cambian en los dos sitios a la vez. */}
            {editandoCliente && selectedCustomer && (
                <CustomerModal
                    open={editandoCliente}
                    editData={selectedCustomer}
                    loading={guardandoCliente}
                    onClose={() => setEditandoCliente(false)}
                    onSave={guardarCliente}
                />
            )}
        </aside>
    );
}
