import { usePublicCatalog } from "../hooks/usePublicCatalog";
import IdentityGate from "../components/PublicCatalog/IdentityGate";
import OrderDetailModal from "../components/PublicCatalog/OrderDetailModal";
import ProductGrid from "../components/PublicCatalog/ProductGrid";
import StoreHeader from "../components/PublicCatalog/StoreHeader";
import OrderBar from "../components/PublicCatalog/OrderBar";
import OrderPanel from "../components/PublicCatalog/OrderPanel";
import MyOrdersModal from "../components/PublicCatalog/MyOrdersModal";
import ProfileModal from "../components/PublicCatalog/ProfileModal";
import StoreWhatsAppButton from "../components/PublicCatalog/StoreWhatsAppButton";

// Página que ve el cliente final. Vive fuera de AppProvider/CartProvider: no hay sesión
// ni permisos, y el carrito de aquí no es el del punto de venta — es una lista que solo
// existe en el navegador del cliente y termina como pedido en el sistema del comercio. No
// se crea ninguna venta ni se aparta inventario: eso lo hace el comercio a mano.
//
// El estado vive en usePublicCatalog; aquí solo queda la composición de la pantalla.
export default function PublicCatalogPage({ token }) {
    const {
        dark, toggle,
        store, categories, products, total, error,
        search, setSearch, category, setCategory,
        loading, loadingMore, loadMore,
        baseCur, altCur, fmt, ordersEnabled, gated,
        cart, cartTotal, cartOpen, setCartOpen,
        addToCart, changeQty, setQtyDirect, handleQtyBlur, removeFromCart, clearCart,
        showCats, setShowCats, delivery, setDelivery,
        identity, saveIdentity, forgetIdentity,
        profileOpen, setProfileOpen, openProfileModal, handleSaveProfile,
        editingProfile, setEditingProfile,
        editName, setEditName, editPhone, setEditPhone,
        ordersOpen, setOrdersOpen, openMyOrders, loadMyOrders,
        myOrders, ordersLoading, ordersError,
        selectedOrder, setSelectedOrder,
        rejectedIds, openOrdersCount,
        canSubmit, submitOrder, sending, sendError,
        placedOrder, closeConfirmation, waHref,
    } = usePublicCatalog(token);

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

    // Puerta de entrada: la tienda pidió que nadie vea el catálogo sin identificarse.
    if (gated) {
        return <IdentityGate token={token} store={store} onIdentified={saveIdentity} />;
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
            />

            <ProductGrid
                products={products} total={total}
                loading={loading} loadingMore={loadingMore} loadMore={loadMore}
                cart={cart} fmt={fmt} baseCur={baseCur} altCur={altCur}
                ordersEnabled={ordersEnabled} onAdd={addToCart}
            />

            <footer className="max-w-5xl mx-auto px-4 py-8 text-center space-y-1 border-t border-border dark:border-white/5 mt-4">
                {store?.phone && (
                    <p className="text-[12px] font-black text-content dark:text-white">{store.phone}</p>
                )}
                {store?.address && (
                    <p className="text-[11px] font-bold text-content-muted">{store.address}</p>
                )}
                <p className="text-[10px] font-bold text-content-subtle pt-2">
                    Precios sujetos a cambio sin previo aviso.
                </p>
                {/* Hueco para que la barra flotante no tape el pie de página */}
                {ordersEnabled && cart.length > 0 && <div className="h-24" />}
            </footer>

            <OrderBar
                visible={ordersEnabled && cart.length > 0 && !cartOpen}
                cart={cart} cartTotal={cartTotal} fmt={fmt} baseCur={baseCur} altCur={altCur}
                onOpen={() => setCartOpen(true)}
            />

            <MyOrdersModal
                open={ordersOpen}
                onClose={() => setOrdersOpen(false)}
                orders={myOrders} loading={ordersLoading} error={ordersError}
                rejectedIds={rejectedIds}
                onSelectOrder={setSelectedOrder} onReload={loadMyOrders} identity={identity}
                fmt={fmt} baseCur={baseCur}
            />

            <OrderPanel
                open={ordersEnabled && cartOpen}
                onClose={placedOrder ? closeConfirmation : () => setCartOpen(false)}
                cart={cart} cartTotal={cartTotal} identity={identity} store={store}
                changeQty={changeQty} setQtyDirect={setQtyDirect} handleQtyBlur={handleQtyBlur}
                removeFromCart={removeFromCart} clearCart={clearCart}
                delivery={delivery} setDelivery={setDelivery}
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
                onForget={forgetIdentity}
                onOpenMyOrders={openMyOrders}
            />

            {/* ── Modal de Detalle de Pedido ── */}
            {selectedOrder && (
                <OrderDetailModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    fmt={fmt}
                    baseCur={baseCur}
                    altCur={altCur}
                />
            )}

            <StoreWhatsAppButton
                store={store}
                hidden={cartOpen || ordersOpen || profileOpen || !!selectedOrder}
            />
        </div>
    );
}
