import { IdentitySheet, BranchSheet } from "../../../components/PublicCatalog/WelcomeSheets";
import LogoutConfirm from "../../../components/PublicCatalog/LogoutConfirm";
import OrderDetailModal from "../../../components/PublicCatalog/OrderDetailModal";
import ProductGrid from "../../../components/PublicCatalog/ProductGrid";
import StoreHeader from "../../../components/PublicCatalog/StoreHeader";
import FloatingCart, { useFlyingAdd } from "../../../components/PublicCatalog/FloatingCart";
import CartDrawer from "../../../components/PublicCatalog/CartDrawer";
import MyOrdersModal from "../../../components/PublicCatalog/MyOrdersModal";
import ProfileModal from "../../../components/PublicCatalog/ProfileModal";
import StoreWhatsAppButton from "../../../components/PublicCatalog/StoreWhatsAppButton";

// Vitrina estándar: la que ve cualquier tienda que no haya elegido un tema propio.
//
// Es presentación y nada más. Todo el estado —productos, carrito, identidad, sucursal,
// envío del pedido— llega ya resuelto en `catalog`, que es lo que devuelve usePublicCatalog.
// Un tema no decide cómo se cobra ni contra qué stock se valida: eso vive en el hook y en
// el servicio, así que maquetar una tienda distinta no puede introducir un error de negocio.
//
// Para agregar otro tema se copia la firma de este archivo —recibe `catalog` y `token`— y se
// registra en ../index.js. Los componentes de PublicCatalog/ son reutilizables: un tema puede
// tomar los que le sirvan y reemplazar solo los que quiera rehacer.
export default function CatalogLayout({ catalog, token }) {
    const {
        dark, toggle,
        store, categories, products, total, error,
        search, setSearch, category, setCategory,
        loading, loadingMore, loadMore,
        baseCur, altCur, fmt, ordersEnabled, gated,
        warehouses, branch, branchGate, chooseBranch, openBranchGate,
        cart, cartTotal, cartOpen, setCartOpen,
        addToCart, changeQty, setQtyDirect, handleQtyBlur, removeFromCart, clearCart,
        showCats, setShowCats, delivery, setDelivery, usesCheckout, canReportPayment, setReportOrder,
        identity, saveIdentity,
        requestLogout, logoutAsk, confirmLogout, cancelLogout,
        profileOpen, setProfileOpen, openProfileModal, handleSaveProfile,
        editingProfile, setEditingProfile,
        editName, setEditName, editPhone, setEditPhone,
        ordersOpen, setOrdersOpen, openMyOrders, loadMyOrders,
        myOrders, ordersLoading, ordersError,
        selectedOrder, setSelectedOrder,
        rejectedIds, openOrdersCount,
        canSubmit, submitOrder, sending, sendError,
        placedOrder, closeConfirmation, waHref,
    } = catalog;

    // El "+" de cada tarjeta agrega directo: con vuelo de la foto al carrito flotante.
    const agregar = useFlyingAdd(addToCart);

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-surface-2 dark:bg-surface-dark">
                <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center text-danger">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <p className="text-sm font-black text-content dark:text-white">{error}</p>
                <p className="text-[11px] font-bold text-content-subtle">Verifica el enlace con la tienda.</p>
            </div>
        );
    }

    // Puerta de entrada (la tienda pidió que nadie pida sin identificarse) y, recién después,
    // dónde va a comprar —al revés, quien cerraba sesión volvía a la cédula pero ya no podía
    // cambiar de tienda—. Las dos van como hojas sobre la tienda de fondo (su cabecera y la
    // rejilla esperando), no como pantallas sueltas: el cliente ve dónde está antes de dar su
    // cédula. El fondo no se toca (inert).
    if (gated || branchGate) {
        return (
            <div className="min-h-screen bg-surface-2 dark:bg-surface-dark">
                <div className="pointer-events-none select-none" aria-hidden="true" {...{ inert: "" }}>
                    <StoreHeader
                        store={store} dark={dark} toggle={toggle}
                        search="" setSearch={() => {}}
                        categories={categories} category="" setCategory={() => {}}
                        showCats={false} setShowCats={() => {}}
                    />
                    <ProductGrid products={[]} total={0} loading loadingMore={false} loadMore={() => {}}
                        cart={[]} fmt={fmt} baseCur={baseCur} altCur={altCur} ordersEnabled={false} onAdd={() => {}} />
                </div>
                {gated
                    ? <IdentitySheet token={token} store={store} onIdentified={saveIdentity} />
                    : <BranchSheet store={store} warehouses={warehouses} onChoose={chooseBranch} currentId={branch?.id || null} />}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-2 dark:bg-surface-dark">
            <StoreHeader
                store={store} identity={identity} dark={dark} toggle={toggle}
                openOrdersCount={openOrdersCount}
                onOpenMyOrders={openMyOrders} onOpenProfile={openProfileModal}
                search={search} setSearch={setSearch}
                categories={categories} category={category} setCategory={setCategory}
                showCats={showCats} setShowCats={setShowCats}
                branch={branch} canChangeBranch={warehouses.length > 1}
                onChangeBranch={openBranchGate}
                onLogout={requestLogout}
            />

            <ProductGrid
                products={products} total={total}
                loading={loading} loadingMore={loadingMore} loadMore={loadMore}
                cart={cart} fmt={fmt} baseCur={baseCur} altCur={altCur}
                ordersEnabled={ordersEnabled} onAdd={agregar}
            />

            <footer className="max-w-5xl mx-auto px-4 py-8 text-center space-y-1 border-t border-border dark:border-white/5 mt-4">
                {store?.phone && (
                    <p className="text-[12px] font-black text-content dark:text-white">{store.phone}</p>
                )}
                {store?.address && (
                    <p className="text-[11px] font-bold text-content-muted">{store.address}</p>
                )}
                {/* Hueco para que el carrito flotante no tape el pie de página */}
                {ordersEnabled && <div className="h-20" />}
            </footer>

            {ordersEnabled && (
                <FloatingCart count={cart.length} total={cartTotal} fmt={fmt} baseCur={baseCur}
                    onOpen={() => setCartOpen(true)} />
            )}

            <MyOrdersModal
                open={ordersOpen}
                onClose={() => setOrdersOpen(false)}
                orders={myOrders} loading={ordersLoading} error={ordersError}
                rejectedIds={rejectedIds}
                onSelectOrder={setSelectedOrder} onReload={loadMyOrders} identity={identity}
                fmt={fmt} baseCur={baseCur} panel="#FFFFFF"
            />

            <CartDrawer
                open={ordersEnabled && cartOpen}
                onClose={placedOrder ? closeConfirmation : () => setCartOpen(false)}
                cart={cart} cartTotal={cartTotal} identity={identity} store={store}
                changeQty={changeQty} setQtyDirect={setQtyDirect} handleQtyBlur={handleQtyBlur}
                removeFromCart={removeFromCart} clearCart={clearCart}
                delivery={delivery} setDelivery={setDelivery} usesCheckout={usesCheckout}
                fmt={fmt} baseCur={baseCur} altCur={altCur}
                canSubmit={canSubmit} onSubmit={submitOrder} sending={sending} sendError={sendError}
                placedOrder={placedOrder} waHref={waHref} onOpenMyOrders={openMyOrders}
            />
            <ProfileModal
                identity={identity}
                open={profileOpen}
                onClose={() => setProfileOpen(false)}
                editing={editingProfile}
                setEditing={setEditingProfile}
                editName={editName}
                setEditName={setEditName}
                editPhone={editPhone}
                setEditPhone={setEditPhone}
                onSave={handleSaveProfile}
                onForget={requestLogout}
                onOpenMyOrders={openMyOrders}
                openOrdersCount={openOrdersCount}
            />

            <LogoutConfirm
                open={logoutAsk}
                itemCount={cart.length}
                onConfirm={confirmLogout}
                onCancel={cancelLogout}
            />

            {/* ── Modal de Detalle de Pedido ── */}
            {selectedOrder && (
                <OrderDetailModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onReportPayment={canReportPayment ? setReportOrder : null}
                    fmt={fmt}
                    baseCur={baseCur}
                    altCur={altCur}
                    panel="#FFFFFF"
                    whatsapp={store?.whatsapp || null}
                />
            )}

            {/* Encima del carrito flotante, como una segunda burbuja más chica. */}
            <StoreWhatsAppButton
                store={store}
                stacked={ordersEnabled}
                hidden={cartOpen || ordersOpen || profileOpen || !!selectedOrder}
            />
        </div>
    );
}
