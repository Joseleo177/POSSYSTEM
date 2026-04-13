import CustomSelect from "../ui/CustomSelect";

export default function CartSidebar({
    mobileTab, setMobileTab,
    cart, addToCart, removeFromCart, changeQty, setQtyDirect,
    subtotalBase, discountAmount, discountEnabled, setDiscountEnabled,
    discountPct, setDiscountPct, totalDisplay,
    convertToDisplay, currSym, fmt,
    currentCurrency, setSelectedCurrency, activeCurrencies,
    selectedSerieId, selectSerie, mySeries,
    activeWarehouse, employeeWarehouses, switchWarehouse,
    selectedCustomer, setSelectedCustomer,
    custSearch, setCustSearch, customers, setCustomers,
    selectedCustIdx, setSelectedCustIdx,
    setCustomerEditData, setCustomerModal,
    cashSession, setShowCierre, setShowHeldModal, heldCarts,
    loading, setShowConfirmCheckout, holdCart,
    searchInputRef,
}) {
    return (
        <aside className={`w-full lg:w-[360px] lg:h-full bg-white dark:bg-[#0c0c0c] flex-col border-b lg:border-r border-border dark:border-white/5 shadow-[20px_0_60px_rgba(0,0,0,0.03)] z-20 shrink-0 order-2 lg:order-1 relative ${mobileTab === "cart" ? "flex" : "hidden"} lg:flex`}>
            <div className="p-4 space-y-3 flex-1 flex flex-col overflow-hidden">

                {/* Mobile toggle */}
                <div className="lg:hidden flex items-center gap-2">
                    <button onClick={() => setMobileTab("products")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${mobileTab === "products" ? "bg-brand-500 text-white" : "bg-surface-2 dark:bg-white/5 text-content-subtle"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                        Catálogo
                    </button>
                    <button onClick={() => setMobileTab("cart")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all relative ${mobileTab === "cart" ? "bg-brand-500 text-white" : "bg-surface-2 dark:bg-white/5 text-content-subtle"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        Carrito
                        {cart.length > 0 && <span className="w-4 h-4 bg-danger text-white text-[11px] font-black rounded-full flex items-center justify-center">{cart.length}</span>}
                    </button>
                </div>

                {/* Header checkout */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        </div>
                        <h2 className="text-[11px] font-black text-content dark:text-white tracking-wide uppercase">Checkout</h2>
                    </div>
                    {cashSession && (
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowHeldModal(true)} className="relative w-9 h-9 rounded-full bg-surface-2 dark:bg-white/5 flex items-center justify-center hover:bg-brand-500 hover:text-white transition-all" title="Cuentas en espera">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2m9-.828l-1.414-1.414M3.707 18.293V21h2.707l14.586-14.586a2 2 0 10-2.828-2.828L3.707 18.293z" /></svg>
                                {heldCarts.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-500 text-brand-900 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-[#0c0c0c]">{heldCarts.length}</span>}
                            </button>
                            <button onClick={() => setShowCierre(true)} className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-4 py-2 rounded-full hover:bg-green-500/20 transition-all">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[11px] font-black uppercase tracking-wide text-green-500">Sesión Abierta</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Almacén */}
                <div className="flex items-center gap-2 px-4 py-2 bg-brand-500/10 rounded-2xl border border-brand-500/20">
                    <span className="text-xs text-brand-500 shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </span>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-wide text-brand-500 opacity-60 mb-0.5">ALMACÉN DE VENTA</div>
                        <CustomSelect
                            value={activeWarehouse?.id || ""}
                            onChange={val => { const wh = employeeWarehouses.find(w => w.id === parseInt(val)); if (wh) switchWarehouse(wh); }}
                            options={employeeWarehouses.map(w => ({ value: String(w.id), label: w.name }))}
                            placeholder="Seleccionar Almacén"
                            className="w-full !p-0 !bg-transparent !border-none !text-[11px]"
                        />
                    </div>
                </div>

                {/* Cliente */}
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
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
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
                                        className={`w-full text-left px-4 py-2 cursor-pointer border-b border-border/50 dark:border-border-dark/50 transition-colors flex flex-col
                                            ${idx === selectedCustIdx ? "bg-brand-500/20 border-l-4 border-l-brand-500" : "hover:bg-surface-3 dark:hover:bg-surface-dark-3"}`}
                                    >
                                        <div className="text-sm font-bold text-brand-500 truncate">{c.name}</div>
                                        <div className="text-[11px] text-content-muted mt-0.5">{c.rif || "Sin datos adicionales"}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Moneda + Serie */}
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

                {/* Ítems del carrito */}
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
                                <div className="w-12 h-12 rounded-xl bg-surface-2 dark:bg-white/5 flex items-center justify-center shrink-0 overflow-hidden relative">
                                    {i.image_url ? <img src={i.image_url} className="w-full h-full object-cover" alt={i.name} /> : <div className="text-sm opacity-20 dark:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>}
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
                                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); searchInputRef.current?.focus(); } }}
                                        className="w-10 bg-transparent text-center text-[11px] font-black border-none outline-none dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <button onClick={() => changeQty(i.id, 1)} className="w-7 h-7 rounded-lg font-black dark:text-white hover:bg-white/10">+</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer: descuento + totales + botones */}
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
                                <span className="text-xs font-black tabular-nums">{fmt(convertToDisplay(subtotalBase), currSym)}</span>
                            </div>
                            {discountEnabled && discountAmount > 0 && (
                                <div className="flex justify-between items-center text-brand-500">
                                    <span className="text-[11px] font-black uppercase tracking-wide">DESC. ({discountPct}%)</span>
                                    <span className="text-xs font-black tabular-nums">-{fmt(convertToDisplay(discountAmount), currSym)}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between items-end">
                            <span className="text-[11px] font-black text-brand-500 uppercase tracking-wide">TOTAL</span>
                            <div className="text-2xl font-black tracking-tighter tabular-nums font-display dark:text-white">{fmt(totalDisplay, currSym)}</div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={holdCart} disabled={cart.length === 0} className="w-14 h-14 rounded-2xl bg-surface-2 dark:bg-white/5 flex items-center justify-center hover:bg-brand-500 hover:text-white transition-all disabled:opacity-30 shrink-0" title="Poner en espera">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2m9-.828l-1.414-1.414M3.707 18.293V21h2.707l14.586-14.586a2 2 0 10-2.828-2.828L3.707 18.293z" /></svg>
                        </button>
                        <button onClick={() => setShowConfirmCheckout(true)} disabled={loading || cart.length === 0} className="flex-1 bg-brand-500 text-brand-900 py-3.5 rounded-2xl font-black uppercase tracking-wide shadow-xl shadow-brand-500/20 active:scale-95 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                            {loading ? "PROCESANDO..." : "FINALIZAR VENTA"}
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    );
}
