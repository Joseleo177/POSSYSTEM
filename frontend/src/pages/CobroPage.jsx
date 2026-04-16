import { useState, useRef, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useCart } from "../context/CartContext";
import { fmtMoney } from "../helpers";

// Hooks de capa
import { useCobroProducts }  from "../hooks/cobro/useCobroProducts";
import { useCobroCustomer }  from "../hooks/cobro/useCobroCustomer";
import { useCobroSession }   from "../hooks/cobro/useCobroSession";
import { useCobroKeyboard }  from "../hooks/cobro/useCobroKeyboard";

// Componentes de capa
import CartSidebar         from "../components/cobro/CartSidebar";
import ProductGrid         from "../components/cobro/ProductGrid";
import SaleConfirmModal    from "../components/cobro/SaleConfirmModal";
import CustomerModal       from "../components/Customers/CustomerModal";
import HeldCartsModal      from "../components/HeldCartsModal";
import AperturaCajaModal   from "../components/AperturaCajaModal";
import CierreCajaModal     from "../components/CierreCajaModal";
import ConfirmModal        from "../components/ui/ConfirmModal";
import QuantityModal       from "../components/cobro/QuantityModal";

const fmt = fmtMoney;

export default function CobroPage() {
    const { notify, employee, baseCurrency, activeCurrencies, categories } = useApp();

    const {
        cart, addToCart, removeFromCart, changeQty, setQtyDirect,
        subtotalBase, discountAmount, discountEnabled, setDiscountEnabled,
        discountPct, setDiscountPct, totalDisplay, totalSecondary,
        currentCurrency, setSelectedCurrency, secondaryCurrency,
        convertToDisplay, convertToSecondary,
        selectedSerieId, selectSerie, mySeries, loadMySeries,
        selectedCustomer, setSelectedCustomer,
        employeeWarehouses, activeWarehouse, switchWarehouse, loadEmployeeWarehouses,
        checkout, loading, receipt, setReceipt,
        heldCarts, holdCart, takeHeldCart, removeHeldCart,
    } = useCart();

    // ── Carga inicial ──────────────────────────────────────────
    useEffect(() => { loadEmployeeWarehouses(); loadMySeries(); }, [loadEmployeeWarehouses, loadMySeries]);

    // ── Estado local ───────────────────────────────────────────
    const [mobileTab, setMobileTab]               = useState("products");
    const [showConfirmCheckout, setShowConfirmCheckout] = useState(false);
    const [showHeldModal, setShowHeldModal]        = useState(false);
    const [saleBalance, setSaleBalance]            = useState(null);
    const [qtyModalItem, setQtyModalItem]          = useState(null);
    const searchInputRef                           = useRef(null);

    // ── Hooks de capa ──────────────────────────────────────────
    const products = useCobroProducts(activeWarehouse, notify);
    const customer = useCobroCustomer(setSelectedCustomer, notify);
    const session  = useCobroSession(employee, activeWarehouse);

    const currSym = currentCurrency?.symbol || baseCurrency?.symbol || "$";

    useCobroKeyboard({
        cart, receipt, holdCart,
        filteredProducts: products.filteredProducts,
        selectedIndex: products.selectedIndex,
        setSelectedIndex: products.setSelectedIndex,
        checkout,
        showConfirmCheckout, setShowConfirmCheckout,
        setSearch: products.setSearch,
        setShowPayModal: () => {},
        searchInputRef,
        customers: customer.customers,
        selectedCustIdx: customer.selectedCustIdx,
        setSelectedCustIdx: customer.setSelectedCustIdx,
        setSelectedCustomer,
        setCustomers: customer.setCustomers,
        setCustSearch: customer.setCustSearch,
        openQtyModal: setQtyModalItem,
        notify,
    });

    // ── Sin almacén asignado ───────────────────────────────────
    if (employeeWarehouses.length === 0) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-10 animate-in fade-in duration-700">
            <div className="w-24 h-24 rounded-[40px] bg-surface-2 dark:bg-white/5 flex items-center justify-center text-brand-500 shadow-inner mb-4">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <div className="font-black text-xl tracking-wide text-brand-500 uppercase">Sin Acceso a Almacén</div>
            <p className="text-sm text-content-subtle max-w-sm leading-relaxed font-medium">Tu usuario no tiene almacenes asignados.</p>
        </div>
    );

    // ── Modal post-venta ───────────────────────────────────────
    if (receipt) return (
        <SaleConfirmModal
            receipt={receipt}
            saleBalance={saleBalance}
            baseCurrency={baseCurrency}
            currentCurrency={currentCurrency}
            onNext={() => { setReceipt(null); setSaleBalance(null); products.reload(); }}
            onPay={(res) => setSaleBalance({ amount_paid: res.amount_paid, balance: res.balance, status: res.sale_status })}
        />
    );

    // ── Vista principal ────────────────────────────────────────
    return (
        <div className="h-full flex flex-col lg:flex-row bg-[#f8f9fc] dark:bg-[#080808] text-content dark:text-content-dark overflow-hidden font-sans animate-in fade-in duration-1000">

            <CartSidebar
                mobileTab={mobileTab} setMobileTab={setMobileTab}
                cart={cart} addToCart={addToCart} removeFromCart={removeFromCart}
                changeQty={changeQty} setQtyDirect={setQtyDirect}
                subtotalBase={subtotalBase} discountAmount={discountAmount}
                discountEnabled={discountEnabled} setDiscountEnabled={setDiscountEnabled}
                discountPct={discountPct} setDiscountPct={setDiscountPct}
                totalDisplay={totalDisplay} totalSecondary={totalSecondary}
                convertToDisplay={convertToDisplay} convertToSecondary={convertToSecondary}
                currSym={currSym} secondaryCurrency={secondaryCurrency} fmt={fmt}
                currentCurrency={currentCurrency} setSelectedCurrency={setSelectedCurrency}
                activeCurrencies={activeCurrencies}
                selectedSerieId={selectedSerieId} selectSerie={selectSerie} mySeries={mySeries}
                activeWarehouse={activeWarehouse} employeeWarehouses={employeeWarehouses}
                switchWarehouse={switchWarehouse}
                selectedCustomer={selectedCustomer} setSelectedCustomer={setSelectedCustomer}
                custSearch={customer.custSearch} setCustSearch={customer.setCustSearch}
                customers={customer.customers} setCustomers={customer.setCustomers}
                selectedCustIdx={customer.selectedCustIdx}
                setSelectedCustIdx={customer.setSelectedCustIdx}
                setCustomerEditData={customer.setCustomerEditData}
                setCustomerModal={customer.setCustomerModal}
                cashSession={session.cashSession}
                setShowCierre={session.setShowCierre}
                setShowHeldModal={setShowHeldModal}
                heldCarts={heldCarts}
                loading={loading}
                setShowConfirmCheckout={setShowConfirmCheckout}
                holdCart={holdCart}
                openQtyModal={setQtyModalItem}
                searchInputRef={searchInputRef}
            />

            <ProductGrid
                mobileTab={mobileTab} setMobileTab={setMobileTab}
                cart={cart}
                search={products.search} setSearch={products.setSearch}
                onSearchKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); products.setSelectedIndex(0); } }}
                searchInputRef={searchInputRef}
                selectedCat={products.selectedCat} setSelectedCat={products.setSelectedCat}
                categories={categories}
                filteredProducts={products.filteredProducts}
                selectedIndex={products.selectedIndex}
                addToCart={addToCart}
                openQtyModal={setQtyModalItem}
                convertToDisplay={convertToDisplay} convertToSecondary={convertToSecondary}
                currSym={currSym} secondaryCurrency={secondaryCurrency} fmt={fmt}
                loadMore={products.loadMore}
                loadingMore={products.loadingMore}
                hasMore={products.hasMore}
                notify={notify}
            />

            {/* Modales */}
            <CustomerModal
                open={customer.customerModal}
                onClose={() => customer.setCustomerModal(false)}
                onSave={customer.saveCustomer}
            />
            <HeldCartsModal
                open={showHeldModal}
                onClose={() => setShowHeldModal(false)}
                carts={heldCarts}
                onTake={id => { takeHeldCart(id); setShowHeldModal(false); }}
                onRemove={removeHeldCart}
                baseCurrency={baseCurrency}
            />
            <ConfirmModal
                isOpen={showConfirmCheckout}
                title="Venta"
                message="¿Realizar cobro?"
                onConfirm={() => { setShowConfirmCheckout(false); checkout(); }}
                onCancel={() => setShowConfirmCheckout(false)}
                type="primary"
                confirmText="Procesar"
                cancelText="Atrás"
            />
            {session.showApertura && (
                <AperturaCajaModal
                    employee={employee}
                    warehouses={employeeWarehouses}
                    initialWarehouse={activeWarehouse}
                    onWarehouseChange={val => { const wh = employeeWarehouses.find(w => w.id === parseInt(val)); if (wh) switchWarehouse(wh); }}
                    onOpened={s => {
                        session.setCashSession(s);
                        session.setShowApertura(false);
                        const wh = employeeWarehouses.find(w => w.id === s.warehouse_id);
                        if (wh) switchWarehouse(wh);
                    }}
                />
            )}
            {session.showCierre && session.cashSession && (
                <CierreCajaModal
                    session={session.cashSession}
                    onClosed={() => { session.setCashSession(null); session.setShowCierre(false); session.setShowApertura(true); }}
                    onCancel={() => session.setShowCierre(false)}
                />
            )}
            <QuantityModal
                isOpen={!!qtyModalItem}
                onClose={() => setQtyModalItem(null)}
                item={qtyModalItem}
                onSave={(id, q) => {
                    const isInCart = cart.find(i => i.id === id);
                    if (isInCart) {
                        return setQtyDirect(id, q);
                    } else {
                        return addToCart(qtyModalItem, q);
                    }
                }}
            />
        </div>
    );
}
