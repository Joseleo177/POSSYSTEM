import { useState } from "react";
import BranchGate from "../../../components/PublicCatalog/BranchGate";
import IdentityGate from "../../../components/PublicCatalog/IdentityGate";
import LogoutConfirm from "../../../components/PublicCatalog/LogoutConfirm";
import OrderDetailModal from "../../../components/PublicCatalog/OrderDetailModal";
import MyOrdersModal from "../../../components/PublicCatalog/MyOrdersModal";
import StoreWhatsAppButton from "../../../components/PublicCatalog/StoreWhatsAppButton";
import ProductDetail from "../boutique/ProductDetail";

import MenuHeader from "./MenuHeader";
import MenuBanners from "./MenuBanners";
import CategoryTiles from "./CategoryTiles";
import MenuProductList from "./MenuProductList";
import ProductAddModal from "./ProductAddModal";
import CartDrawer from "./CartDrawer";
import ProfileModal from "./ProfileModal";

// Tema "menú": la vitrina con forma de carta de restaurante —mosaicos de "tipos de comida"
// como puerta de entrada, en vez de una rejilla con buscador arriba—. Se elige de la misma
// lista que "boutique" (Ajustes → Vitrina) y sirve para cualquier negocio que se explique
// mejor por categorías grandes que por un listado plano: no solo comida.
//
// Es SOLO presentación, igual que los otros dos temas: el carrito, la identidad, la sucursal,
// los precios y el envío del pedido llegan resueltos en `catalog`, que es lo que devuelve
// usePublicCatalog. La navegación por categoría reutiliza el `category`/`setCategory` que ya
// existía para los chips de filtro de los otros temas — aquí no hay chips, pero es la misma
// pieza de estado, así que no hizo falta inventar una nueva.
//
// Las puertas de identificación y sucursal (IdentityGate/BranchGate) todavía son las claras
// del tema estándar: quedan pendientes de una versión oscura propia, igual que le pasó a
// boutique hasta que se vieron y se ajustaron con lo que en pantalla no convencía.
const DEFAULT_BG = "#0A0A0A";

export default function CatalogLayout({ catalog, token }) {
    const {
        store, categories, products, total, error, banners,
        category, setCategory,
        loading, loadingMore, loadMore,
        baseCur, altCur, fmt, ordersEnabled, gated,
        warehouses, branch, branchGate, chooseBranch, openBranchGate,
        cart, cartTotal, cartOpen, setCartOpen,
        setCartItem, changeQty, setQtyDirect, handleQtyBlur, removeFromCart, clearCart,
        delivery, setDelivery,
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
        productId, productDetail, productLoading, productError, openProduct, closeProduct,
    } = catalog;

    // Qué producto se está personalizando ahora mismo (foto, nota, cantidad). null = cerrado.
    // Vive aparte del carrito: es un borrador hasta que se confirma, y cerrar el modal sin
    // confirmar no debe dejar nada a medio agregar.
    const [addingProduct, setAddingProduct] = useState(null);

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-neutral-950">
                <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center text-danger">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <p className="text-sm font-black text-white">{error}</p>
                <p className="text-[11px] font-bold text-white/50">Verifica el enlace con la tienda.</p>
            </div>
        );
    }

    if (gated) return <IdentityGate token={token} store={store} onIdentified={saveIdentity} />;
    if (branchGate) {
        return <BranchGate store={store} warehouses={warehouses} onChoose={chooseBranch} currentId={branch?.id || null} />;
    }

    // Un producto abierto por enlace directo (compartido por WhatsApp) también se ve aquí,
    // aunque este tema no ofrezca un botón para llegar a él navegando: el enlace no puede
    // morir en blanco solo porque la tienda cambió de tema después de compartirlo.
    if (productId) {
        return (
            <div className="min-h-screen" style={{ backgroundColor: store?.bg_color || DEFAULT_BG }}>
                <MenuHeader
                    store={store} showBack onBack={closeProduct}
                    cartCount={cart.length} cartTotal={cartTotal} fmt={fmt} baseCur={baseCur}
                    onOpenCart={() => setCartOpen(true)} ordersEnabled={ordersEnabled}
                    identity={identity} openOrdersCount={openOrdersCount} onOpenProfile={openProfileModal} onLogout={requestLogout}
                    bgColor={store?.bg_color}
                />
                <ProductDetail
                    p={productDetail} loading={productLoading} error={productError}
                    onBack={(categoryId) => { closeProduct(); if (categoryId) setCategory(categoryId); }}
                    inCart={cart.find(it => it.id === productId)}
                    fmt={fmt} baseCur={baseCur} altCur={altCur}
                    canOrder={ordersEnabled} onAdd={setAddingProduct}
                />
                {dialogs()}
            </div>
        );
    }

    const categoriaActual = category ? categories.find(c => String(c.id) === String(category)) : null;

    return (
        <div className="min-h-screen flex flex-col" style={{ backgroundColor: store?.bg_color || DEFAULT_BG }}>
            <MenuHeader
                store={store} showBack={!!category} onBack={() => setCategory("")}
                cartCount={cart.length} cartTotal={cartTotal} fmt={fmt} baseCur={baseCur}
                onOpenCart={() => setCartOpen(true)} ordersEnabled={ordersEnabled}
                bgColor={store?.bg_color}
                identity={identity} openOrdersCount={openOrdersCount} onOpenProfile={openProfileModal} onLogout={requestLogout}
                branch={branch} canChangeBranch={warehouses.length > 1} onChangeBranch={openBranchGate}
            />

            <div className="flex-1 pb-10">
                {category ? (
                    <MenuProductList
                        category={categoriaActual}
                        categories={categories} onSwitchCategory={setCategory}
                        panelColor={store?.panel_color}
                        products={products} total={total}
                        loading={loading} loadingMore={loadingMore} loadMore={loadMore}
                        cart={cart} fmt={fmt} baseCur={baseCur} altCur={altCur}
                        ordersEnabled={ordersEnabled} onOpenAdd={setAddingProduct}
                    />
                ) : (
                    <>
                        <MenuBanners banners={banners} />
                        <CategoryTiles categories={categories} onPick={setCategory} />
                    </>
                )}
            </div>

            {dialogs()}
        </div>
    );

    // Todo lo que no es pantalla —carrito, modales, botón de WhatsApp— es igual se esté en
    // los mosaicos, en una categoría o en la ficha de un producto.
    function dialogs() {
        return (
            <>
                <ProductAddModal
                    product={addingProduct}
                    existing={addingProduct ? cart.find(it => it.id === addingProduct.id) : null}
                    onClose={() => setAddingProduct(null)}
                    onConfirm={(p, qty, note) => setCartItem(p, qty, note)}
                    fmt={fmt} baseCur={baseCur} altCur={altCur}
                    panelColor={store?.panel_color}
                />

                <CartDrawer
                    open={ordersEnabled && cartOpen}
                    onClose={placedOrder ? closeConfirmation : () => setCartOpen(false)}
                    cart={cart} cartTotal={cartTotal} identity={identity} store={store}
                    changeQty={changeQty} setQtyDirect={setQtyDirect} handleQtyBlur={handleQtyBlur}
                    removeFromCart={removeFromCart} clearCart={clearCart}
                    delivery={delivery} setDelivery={setDelivery}
                    fmt={fmt} baseCur={baseCur} altCur={altCur}
                    canSubmit={canSubmit} onSubmit={submitOrder} sending={sending} sendError={sendError}
                    placedOrder={placedOrder} waHref={waHref} onOpenMyOrders={openMyOrders}
                    panelColor={store?.panel_color}
                />

                <MyOrdersModal
                    open={ordersOpen}
                    onClose={() => setOrdersOpen(false)}
                    orders={myOrders} loading={ordersLoading} error={ordersError}
                    rejectedIds={rejectedIds}
                    onSelectOrder={setSelectedOrder} onReload={loadMyOrders} identity={identity}
                    fmt={fmt} baseCur={baseCur}
                />

                <ProfileModal
                    identity={identity}
                    open={profileOpen}
                    onClose={() => setProfileOpen(false)}
                    editing={editingProfile} setEditing={setEditingProfile}
                    editName={editName} setEditName={setEditName}
                    editPhone={editPhone} setEditPhone={setEditPhone}
                    onSave={handleSaveProfile}
                    onForget={requestLogout}
                    onOpenMyOrders={openMyOrders}
                    panelColor={store?.panel_color}
                />

                <LogoutConfirm
                    open={logoutAsk}
                    itemCount={cart.length}
                    onConfirm={confirmLogout}
                    onCancel={cancelLogout}
                />

                {selectedOrder && (
                    <OrderDetailModal
                        order={selectedOrder}
                        onClose={() => setSelectedOrder(null)}
                        fmt={fmt} baseCur={baseCur} altCur={altCur}
                    />
                )}

                <StoreWhatsAppButton
                    store={store}
                    hidden={cartOpen || ordersOpen || profileOpen || !!selectedOrder}
                />
            </>
        );
    }
}
