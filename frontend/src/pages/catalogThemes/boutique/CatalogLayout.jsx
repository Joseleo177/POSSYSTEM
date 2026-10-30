import { IdentitySheet, BranchSheet } from "../../../components/PublicCatalog/WelcomeSheets";
import LogoutConfirm from "../../../components/PublicCatalog/LogoutConfirm";
import OrderDetailModal from "../../../components/PublicCatalog/OrderDetailModal";
import FloatingCart, { useFlyingAdd } from "../../../components/PublicCatalog/FloatingCart";
import MyOrdersModal from "../../../components/PublicCatalog/MyOrdersModal";
import ProfileModal from "../../../components/PublicCatalog/ProfileModal";
import StoreWhatsAppButton from "../../../components/PublicCatalog/StoreWhatsAppButton";
import { toNameCase } from "../../../helpers";

import CartDrawer from "../../../components/PublicCatalog/CartDrawer";
import StorefrontHeader from "./StorefrontHeader";
import HeroCarousel from "./HeroCarousel";
import BrandStatement from "./BrandStatement";
import CategoryStrip from "./CategoryStrip";
import BoutiqueGrid from "./BoutiqueGrid";
import FeaturedRow from "./FeaturedRow";
import CategoryProductRow from "./CategoryProductRow";
import AllProductsSection from "./AllProductsSection";
import ProductDetail from "./ProductDetail";
import HowItWorks from "./HowItWorks";
import FeatureCarousel from "./FeatureCarousel";
import StoreFooter from "./StoreFooter";

// Tema "boutique": la vitrina con forma de tienda de marca —franja de anuncio, carrusel de
// portada, categorías con foto y fichas con marca, beneficio y precio tachado.
//
// Es SOLO presentación. El carrito, la identidad, la sucursal, los precios y el envío del
// pedido son exactamente los mismos que en el tema estándar: llegan resueltos en `catalog`,
// que es lo que devuelve usePublicCatalog. Cambiar de tema cambia cómo se ve la tienda, nunca
// cómo se cobra ni contra qué inventario se valida.
//
// Los diálogos (carrito, mis pedidos, perfil, salir) se reutilizan del tema estándar: son
// pantallas de trámite, ya están resueltas y rehacerlas solo multiplicaría los sitios donde
// arreglar un error.
function PortadaCargando() {
    return (
        <div className="min-h-screen bg-surface-2 dark:bg-surface-dark" aria-busy="true" aria-label="Cargando la tienda">
            <div className="bg-surface dark:bg-surface-dark-2 border-b border-border/60 dark:border-white/[0.06]">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-center">
                    <div className="skeleton w-28 h-9 rounded-xl" />
                </div>
                <div className="max-w-6xl mx-auto px-4 h-[52px] flex items-center gap-3 overflow-hidden">
                    {[72, 96, 120, 84, 104].map((w, i) => (
                        <div key={i} className="skeleton h-8 rounded-full shrink-0" style={{ width: w }} />
                    ))}
                </div>
            </div>
            <div className="max-w-6xl mx-auto px-3 md:px-4 pt-3 md:pt-6">
                <div className="skeleton aspect-[16/10] md:aspect-[3/1] rounded-2xl md:rounded-[28px]" />
            </div>
            <div className="max-w-6xl mx-auto px-4 pt-12">
                <div className="skeleton h-6 w-48 rounded-full mb-5" />
                <div className="flex gap-5 overflow-hidden">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="skeleton shrink-0 w-[152px] sm:w-[184px] lg:w-[206px] aspect-[4/5] rounded-[26px]" />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function CatalogLayout({ catalog, token }) {
    const {
        dark, toggle,
        store, categories, products, total, error, banners, features, menu,
        search, setSearch, category, setCategory,
        loading, loadingMore, loadMore,
        baseCur, altCur, fmt, ordersEnabled, gated,
        warehouses, branch, branchGate, chooseBranch, openBranchGate,
        cart, cartTotal, cartOpen, setCartOpen,
        addToCart, changeQty, setQtyDirect, handleQtyBlur, removeFromCart, clearCart,
        delivery, setDelivery, usesCheckout, canReportPayment, setReportOrder,
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

    // Mientras llega la tienda, un esqueleto con la forma de la portada. Antes se dibujaba la
    // página real con la tienda vacía: cabecera sin logo, "Ofertas" con un carril invisible y
    // un pie con "© 2026" y nada más. Se leía como una tienda rota, no como una que carga.
    if (!store) return <PortadaCargando />;

    // Identificarse y elegir tienda van como hojas ENCIMA de la portada real —cabecera,
    // carrusel, lema y categorías, que cargan sin identidad— y no como pantallas sueltas: el
    // cliente ve la tienda antes de dar su cédula, y eso la hace creíble. La portada de fondo
    // no se toca (inert) y no pide productos: los carriles quedan fuera hasta tener sucursal.
    if (gated || branchGate) {
        return (
            <div className="min-h-screen bg-surface-2 dark:bg-surface-dark flex flex-col">
                <div className="flex-1 flex flex-col pointer-events-none select-none" aria-hidden="true" {...{ inert: "" }}>
                    <StorefrontHeader
                        store={store} dark={dark} toggle={toggle}
                        categories={categories} menu={menu}
                        search="" setSearch={() => {}} category="" setCategory={() => {}}
                        ordersEnabled={false} onGoHome={() => {}}
                    />
                    <HeroCarousel banners={banners} />
                    <BrandStatement slogan={store?.slogan} highlights={store?.highlights} />
                    <CategoryStrip categories={categories} onPick={() => {}} />
                </div>
                {gated
                    ? <IdentitySheet token={token} store={store} onIdentified={saveIdentity} />
                    : <BranchSheet store={store} warehouses={warehouses} onChoose={chooseBranch} currentId={branch?.id || null} />}
            </div>
        );
    }

    // La portada —carrusel, categorías, cómo comprar— solo se muestra cuando el cliente
    // todavía no está buscando nada. En cuanto escribe o elige una categoría, la pantalla se
    // convierte en el listado: dejar el carrusel arriba empujaría los resultados fuera de
    // vista justo cuando son lo único que importa.
    const enPortada = !search && !category;
    const tituloListado = category
        ? (toNameCase(categories.find(c => String(c.id) === String(category))?.name) || "Productos")
        : (search ? `Resultados de "${search}"` : "Todos los productos");

    return (
        <div className="min-h-screen bg-surface-2 dark:bg-surface-dark flex flex-col">
            <StorefrontHeader
                store={store} identity={identity} dark={dark} toggle={toggle}
                categories={categories} menu={menu}
                search={search} setSearch={setSearch}
                category={category} setCategory={setCategory}
                openOrdersCount={openOrdersCount}
                onOpenMyOrders={openMyOrders} onOpenProfile={openProfileModal}
                branch={branch} canChangeBranch={warehouses.length > 1} onChangeBranch={openBranchGate}
                cartCount={cart.length} cartTotal={cartTotal} fmt={fmt} baseCur={baseCur}
                // El carrito ya no va en la cabecera: flota abajo (FloatingCart).
                onOpenCart={() => setCartOpen(true)} ordersEnabled={false}
                onGoHome={() => { setSearch(""); setCategory(""); closeProduct(); }}
            />

            <div className="flex-1">
                {/* La ficha de un producto reemplaza el cuerpo entero — no se apila sobre la
                    rejilla — porque tiene su propia dirección: quien entra por un enlace
                    compartido de WhatsApp llega directo aquí y nunca vio la portada. */}
                {productId ? (
                    <ProductDetail
                        p={productDetail} loading={productLoading} error={productError}
                        onBack={(categoryId) => { closeProduct(); if (categoryId) setCategory(categoryId); }}
                        inCart={cart.find(it => it.id === productId)}
                        cart={cart}
                        fmt={fmt} baseCur={baseCur} altCur={altCur}
                        canOrder={ordersEnabled} onAdd={agregar} onQty={changeQty}
                        store={store}
                        onOpenProduct={(id) => { openProduct(id); window.scrollTo({ top: 0 }); }}
                    />
                ) : (
                    <>
                        {enPortada ? (
                            <>
                                <HeroCarousel banners={banners} />
                                <BrandStatement slogan={store?.slogan} highlights={store?.highlights} />

                                {/* Ofertas y combos primero, antes de las categorías: es lo
                                    que la tienda ya decidió resaltar, así que no debe quedar
                                    a la misma altura que el resto del catálogo. Se dibuja
                                    sola y desaparece sin dejar hueco si hoy no hay nada que
                                    destacar. */}
                                <FeaturedRow
                                    token={token} warehouseId={branch?.id}
                                    cart={cart} fmt={fmt} baseCur={baseCur} altCur={altCur}
                                    ordersEnabled={ordersEnabled} onAdd={agregar} onQty={changeQty}
                                    onOpenProduct={openProduct}
                                />

                                <CategoryStrip categories={categories} onPick={setCategory} />

                                {/* Un carril corto por categoría, no la rejilla completa: con
                                    el catálogo entero publicado, "Todos los productos" de
                                    entrada llenaba la portada antes de que el cliente viera
                                    otra cosa. Cada carril se pide aparte (ver
                                    CategoryProductRow) y "Ver todos" lleva a la MISMA rejilla
                                    completa de siempre — no se perdió, solo dejó de ser lo
                                    primero que se ve.

                                    Un carril por CADA categoría de la tienda volvía a caer en
                                    el mismo problema con 8 o 10 categorías: la portada no
                                    terminaba nunca de bajar. Ahora solo llevan carril las que
                                    el comercio marcó como destacadas (Ajustes → Vitrina →
                                    "Menú destacado" — el mismo que ya arma los accesos
                                    directos de la cabecera), y el nombre que eligió ahí es el
                                    que se usa de título. Sin ninguna marcada, se cae a las 3
                                    primeras para que la portada no se quede sin nada que
                                    mostrar en cuanto se estrena el tema. El resto de las
                                    categorías se sigue viendo entera desde "Nuestros
                                    productos" más abajo, o desde CategoryStrip arriba. */}
                                {(menu.length ? menu : categories.slice(0, 3).map((c) => ({ category_id: c.id, label: c.name })))
                                    .map((entry) => {
                                        const cat = categories.find((c) => c.id === entry.category_id);
                                        if (!cat) return null;
                                        return (
                                            <CategoryProductRow
                                                key={cat.id}
                                                category={{ ...cat, name: entry.label || cat.name }}
                                                token={token} warehouseId={branch?.id}
                                                cart={cart} fmt={fmt} baseCur={baseCur} altCur={altCur}
                                                ordersEnabled={ordersEnabled} onAdd={agregar} onQty={changeQty}
                                                onOpenProduct={openProduct} onSeeAll={setCategory}
                                            />
                                        );
                                    })}

                                <HowItWorks />

                                <AllProductsSection
                                    categories={categories} token={token} warehouseId={branch?.id}
                                    cart={cart} fmt={fmt} baseCur={baseCur} altCur={altCur}
                                    ordersEnabled={ordersEnabled} onAdd={agregar} onQty={changeQty}
                                    onOpenProduct={openProduct} onSeeAll={setCategory}
                                />

                                <FeatureCarousel features={features} />
                            </>
                        ) : (
                            <BoutiqueGrid
                                products={products} total={total}
                                loading={loading} loadingMore={loadingMore} loadMore={loadMore}
                                cart={cart} fmt={fmt} baseCur={baseCur} altCur={altCur}
                                ordersEnabled={ordersEnabled} onAdd={agregar} onQty={changeQty}
                                token={token} onOpenProduct={openProduct}
                                title={tituloListado}
                            />
                        )}
                    </>
                )}
            </div>

            <StoreFooter
                store={store}
                pegado={!productId && enPortada && features?.length > 0}
                flotantes={ordersEnabled}
            />


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
                editing={editingProfile} setEditing={setEditingProfile}
                editName={editName} setEditName={setEditName}
                editPhone={editPhone} setEditPhone={setEditPhone}
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

            {selectedOrder && (
                <OrderDetailModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onReportPayment={canReportPayment ? setReportOrder : null}
                    fmt={fmt} baseCur={baseCur} altCur={altCur}
                    panel="#FFFFFF" whatsapp={store?.whatsapp || null}
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
