import { useState, useEffect, useCallback, useRef } from "react";
import { publicApi } from "../services/api";
import { resolveImageUrl, imgRetryOnError } from "../helpers";
import { isIntegerUnit, fmtQtyUnit } from "../helpers/unitFormatter";

const PAGE_SIZE = 24;

// Sumar 0,5 repetidas veces en coma flotante deja colas del tipo 1.7999999999; el
// inventario del sistema trabaja con 3 decimales, así que se recorta a lo mismo.
const round3 = (n) => Math.round(n * 1000) / 1000;

// Misma convención de documento que el POS (ver Customers/CustomerModal): prefijo, guion
// y solo dígitos. J y G son RIF jurídicos y llevan uno más.
const DOC_PREFIXES = ["V", "E", "J", "G", "P"];
const docMaxLen = (prefix) => (["J", "G"].includes(prefix) ? 9 : 8);

// Página que ve el cliente final. Vive fuera de AppProvider/CartProvider: no hay sesión
// ni permisos, y el carrito de aquí no es el del punto de venta — es una lista que solo
// existe en el navegador del cliente y termina en un mensaje de WhatsApp. No se crea
// ninguna venta ni se aparta inventario: eso lo hace el comercio a mano.
export default function PublicCatalogPage({ token }) {
    const [store, setStore]           = useState(null);
    const [currencies, setCurrencies] = useState([]);
    const [categories, setCategories] = useState([]);
    const [products, setProducts]     = useState([]);
    const [total, setTotal]           = useState(0);
    const [search, setSearch]         = useState("");
    const [category, setCategory]     = useState("");
    const [loading, setLoading]       = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError]           = useState(null);
    const reqRef = useRef(0);

    // Carrito: se guarda por token para que cerrar la pestaña sin querer no borre lo
    // que el cliente venía armando.
    const cartKey = `catalog_cart_${token}`;
    const [cart, setCart] = useState(() => {
        try { return JSON.parse(localStorage.getItem(`catalog_cart_${token}`)) || []; }
        catch { return []; }
    });
    const [cartOpen, setCartOpen]         = useState(false);
    const [showCats, setShowCats]         = useState(false);
    const [delivery, setDelivery]         = useState("");

    // Identidad del visitante. Se recuerda en el navegador para que no tenga que
    // escribir su cédula cada vez que abre el enlace.
    const identityKey = `catalog_identity_${token}`;
    const [identity, setIdentity] = useState(() => {
        try { return JSON.parse(localStorage.getItem(`catalog_identity_${token}`)) || null; }
        catch { return null; }
    });

    const saveIdentity = (next) => {
        setIdentity(next);
        try { localStorage.setItem(identityKey, JSON.stringify(next)); } catch { /* modo privado */ }
    };

    const forgetIdentity = () => {
        setIdentity(null);
        setCartOpen(false);
        setOrdersOpen(false);
        try { localStorage.removeItem(identityKey); } catch { /* modo privado */ }
    };

    // Seguimiento de pedidos. Los ids enviados desde este navegador se recuerdan aparte:
    // un pedido rechazado se borra del servidor (no queda como 'anulado', porque nunca fue
    // un documento), así que sin esta lista simplemente desaparecería de la pantalla del
    // cliente sin explicación.
    const placedKey = `catalog_placed_${token}`;
    const [placedIds, setPlacedIds] = useState(() => {
        try { return JSON.parse(localStorage.getItem(`catalog_placed_${token}`)) || []; }
        catch { return []; }
    });
    const [ordersOpen, setOrdersOpen]       = useState(false);
    const [myOrders, setMyOrders]           = useState(null);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [ordersError, setOrdersError]     = useState(null);

    const rememberPlaced = (id) => {
        setPlacedIds(prev => {
            const next = [id, ...prev.filter(x => x !== id)].slice(0, 30);
            try { localStorage.setItem(placedKey, JSON.stringify(next)); } catch { /* modo privado */ }
            return next;
        });
    };

    const loadMyOrders = useCallback(async () => {
        if (!identity) return;
        setOrdersLoading(true);
        setOrdersError(null);
        try {
            const r = await publicApi.myOrders(token, identity.document);
            setMyOrders(r.data.orders || []);
        } catch (e) {
            setOrdersError(e.message || "No se pudieron cargar tus pedidos.");
        } finally {
            setOrdersLoading(false);
        }
    }, [token, identity]);

    const openMyOrders = () => { setOrdersOpen(true); loadMyOrders(); };

    // Pedidos que este navegador envió y el servidor ya no devuelve: la tienda los
    // rechazó. Se muestran igual, para que el cliente no se quede esperando algo que no
    // va a llegar.
    //
    // La consulta trae solo los últimos 15, así que "no está en la lista" no basta: un
    // pedido más viejo que el más antiguo devuelto simplemente quedó fuera de página, no
    // fue rechazado. Los ids son correlativos, así que sirven para distinguirlo.
    const oldestReturnedId = myOrders?.length ? Math.min(...myOrders.map(o => o.id)) : 0;
    const rejectedIds = myOrders
        ? placedIds.filter(id => id > oldestReturnedId && !myOrders.some(o => o.id === id))
        : [];

    // Cuántos siguen en curso, para el distintivo de la cabecera.
    const openOrdersCount = (myOrders || []).filter(o => ["enviado", "confirmado"].includes(o.stage)).length;

    const [sending, setSending]           = useState(false);
    const [sendError, setSendError]       = useState(null);
    // Pedido ya registrado en el servidor. Mientras exista, el panel muestra la
    // confirmación en vez del carrito.
    const [placedOrder, setPlacedOrder]   = useState(null);
    // Clave de idempotencia del envío en curso: sobrevive a los reintentos y solo se
    // renueva cuando el pedido entra. Sin ella, un doble toque o un reintento por señal
    // mala le deja al comercio el mismo pedido dos veces en la lista.
    const orderKeyRef = useRef(null);

    useEffect(() => {
        try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch { /* modo privado */ }
    }, [cart, cartKey]);

    const baseCur = currencies.find(c => c.is_base) || null;
    const altCur  = currencies.find(c => !c.is_base) || null;

    const fmt = (amount, cur) => {
        if (!cur) return "";
        const value = parseFloat(amount) * (cur.is_base ? 1 : cur.exchange_rate);
        return `${cur.symbol}${value.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const ordersEnabled = !!store?.orders_enabled;
    // La identificación solo tiene sentido si la tienda acepta pedidos: es lo que enlaza
    // al visitante con su ficha. Con los pedidos apagados el enlace es una vitrina y pedir
    // la cédula para mirar precios no aportaría nada.
    // `store` null todavía = cabecera cargando; no se decide nada hasta tenerla.
    const gated = !!store && ordersEnabled && !identity;
    const cartTotal = cart.reduce((sum, it) => sum + parseFloat(it.price) * it.qty, 0);

    // Paso de cantidad: las unidades contables van de uno en uno; peso y volumen admiten
    // medios, que es como se pide en mostrador ("medio kilo").
    const stepFor = (unit) => (isIntegerUnit(unit) ? 1 : 0.5);

    const addToCart = (p) => {
        setCart(prev => {
            const found = prev.find(it => it.id === p.id);
            if (found) {
                return prev.map(it => it.id === p.id ? { ...it, qty: round3(it.qty + stepFor(it.unit)) } : it);
            }
            return [...prev, { id: p.id, name: p.name, price: p.price, unit: p.unit, image_url: p.image_url, qty: stepFor(p.unit) }];
        });
    };

    const changeQty = (id, delta) => {
        setCart(prev => prev.flatMap(it => {
            if (it.id !== id) return [it];
            const next = round3(it.qty + delta * stepFor(it.unit));
            return next > 0 ? [{ ...it, qty: next }] : [];
        }));
    };

    const removeFromCart = (id) => setCart(prev => prev.filter(it => it.id !== id));
    const clearCart = () => { setCart([]); setCartOpen(false); };

    // Los datos del cliente ya se capturaron al entrar, así que aquí solo queda el
    // carrito: pedirlos otra vez en el panel sería repetir el mismo formulario.
    const canSubmit = !!identity && cart.length > 0;

    // Envía el pedido al comercio. El detalle viaja a su sistema, no por WhatsApp: allá
    // queda como una cuenta pendiente que pueden facturar. El carrito se vacía solo
    // cuando el servidor confirma; si algo falla, el cliente no pierde lo que armó.
    const submitOrder = async () => {
        if (!canSubmit || sending) return;
        if (!orderKeyRef.current) {
            orderKeyRef.current = crypto?.randomUUID?.() ?? `o-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }
        setSending(true);
        setSendError(null);
        try {
            const r = await publicApi.createOrder(token, {
                items: cart.map(it => ({ product_id: it.id, quantity: it.qty })),
                customer_name: identity.name,
                customer_phone: identity.phone,
                customer_document: identity.document,
                note: delivery.trim(),
                idempotency_key: orderKeyRef.current,
            });
            orderKeyRef.current = null;
            setPlacedOrder({ id: r.data.id, total: r.data.total });
            setCart([]);
            rememberPlaced(r.data.id);
            loadMyOrders();
        } catch (e) {
            setSendError(e.message || "No se pudo enviar el pedido. Intenta de nuevo.");
        } finally {
            setSending(false);
        }
    };

    // Mensaje corto a propósito: el detalle ya está en el sistema del comercio. Esto solo
    // abre la conversación para que puedan responder y mandar la factura.
    const waHref = (store?.whatsapp && placedOrder)
        ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(
            `Hola, acabo de enviar el pedido #${placedOrder.id} a nombre de ${identity?.name || ""}.`
          )}`
        : null;

    const closeConfirmation = () => {
        setPlacedOrder(null);
        setCartOpen(false);
        setDelivery("");
    };

    // Cabecera de la tienda: una sola vez.
    useEffect(() => {
        let alive = true;
        publicApi.getStore(token)
            .then(r => {
                if (!alive) return;
                setStore(r.data.store);
                setCurrencies(r.data.currencies || []);
                setCategories(r.data.categories || []);
            })
            .catch(() => alive && setError("Este catálogo no está disponible."));
        return () => { alive = false; };
    }, [token]);

    // Productos: se recargan al buscar o cambiar de categoría (con debounce en la búsqueda).
    // Mientras el visitante no se identifique no se pide nada: la pantalla que vería son
    // los datos de la tienda, no un catálogo.
    useEffect(() => {
        if (gated) return;
        const id = ++reqRef.current;
        setLoading(true);
        const t = setTimeout(() => {
            publicApi.getProducts(token, { search, category_id: category, limit: PAGE_SIZE, offset: 0 })
                .then(r => {
                    if (id !== reqRef.current) return; // llegó tarde, ya hay otra búsqueda
                    setProducts(r.data.products || []);
                    setTotal(r.data.total || 0);
                })
                .catch(() => id === reqRef.current && setError("No se pudieron cargar los productos."))
                .finally(() => id === reqRef.current && setLoading(false));
        }, search ? 300 : 0);
        return () => clearTimeout(t);
    }, [token, search, category, gated]);

    // Una carga al entrar para que el distintivo de "Mis pedidos" diga algo desde el
    // principio. No se repite sola: quien esté esperando abre el panel y ve el estado
    // fresco, sin dejar el teléfono consultando en bucle.
    useEffect(() => {
        if (identity && !gated) loadMyOrders();
    }, [identity, gated, loadMyOrders]);

    const loadMore = useCallback(() => {
        if (loadingMore || products.length >= total) return;
        setLoadingMore(true);
        publicApi.getProducts(token, { search, category_id: category, limit: PAGE_SIZE, offset: products.length })
            .then(r => setProducts(p => [...p, ...(r.data.products || [])]))
            .catch(() => {})
            .finally(() => setLoadingMore(false));
    }, [token, search, category, products.length, total, loadingMore]);

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
            {/* Cabecera de la tienda */}
            <header className="bg-surface dark:bg-surface-dark-2 border-b border-border dark:border-white/5 sticky top-0 z-20">
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
                    {store?.logo_url && (
                        <img
                            src={resolveImageUrl(store.logo_url)}
                            alt={store.name}
                            onError={imgRetryOnError}
                            className="w-12 h-12 rounded-xl object-cover shrink-0 border border-border dark:border-white/10"
                        />
                    )}
                    <div className="min-w-0">
                        <h1 className="text-base font-black text-content dark:text-white uppercase tracking-tight truncate">
                            {store?.name || "Catálogo"}
                        </h1>
                        {store?.slogan && (
                            <p className="text-[11px] font-bold text-content-muted italic truncate">{store.slogan}</p>
                        )}
                    </div>
                    {/* Seguimiento de los pedidos propios. El distintivo cuenta los que
                        siguen en curso, para que se note sin tener que abrir nada. */}
                    {identity && (
                        <button
                            onClick={openMyOrders}
                            className="ml-auto shrink-0 h-11 px-3.5 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-2 text-content-muted hover:text-brand-500 hover:border-brand-500/40 transition-colors"
                        >
                            <span className="relative">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                            {/* Contador sobre el icono: en móvil el texto se oculta y el
                                distintivo tiene que seguir viéndose. */}
                            {openOrdersCount > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-500 text-black text-[9px] font-black flex items-center justify-center tabular-nums">
                                    {openOrdersCount}
                                </span>
                            )}
                            </span>
                            <span className="hidden sm:inline text-[11px] font-black uppercase tracking-widest">
                                Mis pedidos
                            </span>
                        </button>
                    )}
                    {altCur && baseCur && (
                        <div className={`text-right shrink-0 hidden sm:block ${identity ? "pl-4" : "ml-auto"}`}>
                            <div className="text-[9px] font-black uppercase tracking-widest text-content-subtle">Tasa</div>
                            <div className="text-[11px] font-black text-brand-500 tabular-nums">
                                {altCur.symbol}{altCur.exchange_rate.toLocaleString("es-VE", { maximumFractionDigits: 2 })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Buscador y filtro en una sola fila: la lista de categorías ocupaba un
                    renglón completo aunque no se usara, y en móvil eso es alto de pantalla
                    que se le quita a los productos. */}
                <div className="max-w-5xl mx-auto px-4 pb-3 flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar producto..."
                            className="w-full h-11 pl-10 pr-3 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all placeholder:text-content-subtle"
                        />
                    </div>

                    {categories.length > 0 && (
                        <div className="relative shrink-0">
                            <button
                                onClick={() => setShowCats(v => !v)}
                                className={`h-11 px-3.5 rounded-2xl border flex items-center gap-2 text-[11px] font-black uppercase tracking-widest transition-all ${
                                    category
                                        ? "bg-brand-500 text-black border-brand-500"
                                        : "bg-surface-2 dark:bg-white/5 border-border dark:border-white/10 text-content-muted hover:text-content dark:hover:text-white"
                                }`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                                <span className="hidden sm:inline">
                                    {category ? (categories.find(c => String(c.id) === String(category))?.name || "Filtro") : "Filtrar"}
                                </span>
                            </button>

                            {showCats && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowCats(false)} />
                                    <div className="absolute right-0 top-full mt-2 w-56 max-h-72 overflow-y-auto bg-surface dark:bg-surface-dark-2 rounded-2xl border border-border dark:border-white/10 shadow-2xl z-40 p-2 space-y-0.5">
                                        <CatOption active={!category} onClick={() => { setCategory(""); setShowCats(false); }}>
                                            Todas las categorías
                                        </CatOption>
                                        {categories.map(c => (
                                            <CatOption
                                                key={c.id}
                                                active={String(category) === String(c.id)}
                                                onClick={() => { setCategory(String(c.id)); setShowCats(false); }}
                                            >
                                                {c.name}
                                            </CatOption>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* Grilla */}
            <main className="max-w-5xl mx-auto px-4 py-5">
                {loading ? (
                    <div className="py-24 text-center text-[11px] font-black uppercase tracking-widest text-content-subtle">
                        Cargando...
                    </div>
                ) : products.length === 0 ? (
                    <div className="py-24 text-center text-[11px] font-black uppercase tracking-widest text-content-subtle">
                        No se encontraron productos
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                            {products.map(p => (
                                <article
                                    key={p.id}
                                    className={`bg-surface dark:bg-surface-dark-2 rounded-2xl border border-border dark:border-white/5 overflow-hidden shadow-card dark:shadow-none flex flex-col ${!p.available ? "opacity-60" : ""}`}
                                >
                                    {/* Imagen en absoluto: aspect-square es un alto preferido,
                                        no un tope, y una foto vertical estiraría la tarjeta. */}
                                    <div className="aspect-square bg-surface-2 dark:bg-white/5 relative overflow-hidden">
                                        {p.image_url ? (
                                            <img
                                                src={resolveImageUrl(p.image_url)}
                                                alt={p.name}
                                                loading="lazy"
                                                onError={imgRetryOnError}
                                                className="absolute inset-0 w-full h-full object-cover"
                                            />
                                        ) : (
                                            // Sin foto se muestra la inicial sobre un degradado suave: repetir
                                            // el mismo icono gris en decenas de tarjetas hace ver el catálogo
                                            // roto, mientras que la inicial distingue una tarjeta de otra.
                                            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-500/5 to-brand-500/[0.12]">
                                                <span className="text-3xl font-black text-brand-500/30 select-none">
                                                    {p.name.charAt(0)}
                                                </span>
                                            </div>
                                        )}
                                        {!p.available && (
                                            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-danger text-white text-[9px] font-black uppercase tracking-wide">
                                                Agotado
                                            </span>
                                        )}
                                    </div>
                                    <div className="p-3 flex flex-col gap-1 flex-1">
                                        {p.category_name && (
                                            <span className="text-[9px] font-black uppercase tracking-widest text-brand-500 truncate">
                                                {p.category_name}
                                            </span>
                                        )}
                                        <h2 className="text-[12px] font-black uppercase tracking-tight text-content dark:text-white leading-tight line-clamp-2">
                                            {p.name}
                                        </h2>
                                        <div className="mt-auto pt-1.5">
                                            {/* Un producto sin precio cargado mostraba "Ref.0,00", que en una
                                                vitrina se lee como que es gratis. Mejor invitar a preguntar. */}
                                            {parseFloat(p.price) > 0 ? (
                                                <>
                                                    <div className="text-sm font-black text-content dark:text-white font-display tabular-nums">
                                                        {fmt(p.price, baseCur)}
                                                    </div>
                                                    {altCur && (
                                                        <div className="text-[11px] font-black text-content-muted tabular-nums">
                                                            {fmt(p.price, altCur)}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="text-[11px] font-black uppercase tracking-wide text-content-muted">
                                                    Consultar precio
                                                </div>
                                            )}
                                        </div>

                                        {/* Un producto agotado o sin precio no puede entrar al
                                            pedido: pedirlo solo genera un mensaje que la tienda
                                            tendrá que rechazar. */}
                                        {ordersEnabled && p.available && parseFloat(p.price) > 0 && (
                                            <button
                                                onClick={() => addToCart(p)}
                                                className="mt-2 h-9 rounded-xl bg-brand-500 text-black text-[10px] font-black uppercase tracking-widest hover:brightness-105 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                                            >
                                                {cart.find(it => it.id === p.id) ? (
                                                    <>
                                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                        <span className="truncate">{fmtQtyUnit(cart.find(it => it.id === p.id).qty, p.unit)}</span>
                                                    </>
                                                ) : (
                                                    // "Agregar" a secas no decía a dónde. El icono de carrito
                                                    // más "Al carrito" lo deja explícito sin alargar la tarjeta.
                                                    <>
                                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                                        Al carrito
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>

                        {products.length < total && (
                            <div className="pt-6 text-center">
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="h-10 px-6 rounded-xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-widest hover:brightness-105 transition-all disabled:opacity-50"
                                >
                                    {loadingMore ? "Cargando..." : `Ver más (${total - products.length})`}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </main>

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

            {/* ── Barra del pedido ── */}
            {ordersEnabled && cart.length > 0 && !cartOpen && (
                <div className="fixed bottom-0 inset-x-0 z-30 px-3 pb-3 pt-6 bg-gradient-to-t from-black/30 via-black/10 to-transparent pointer-events-none">
                    <button
                        onClick={() => setCartOpen(true)}
                        className="pointer-events-auto max-w-5xl mx-auto w-full h-14 rounded-2xl bg-brand-500 text-black shadow-2xl shadow-black/30 flex items-center gap-3 pl-3 pr-4 active:scale-[0.99] transition-transform"
                    >
                        {/* Carrito con su contador: el número suelto no decía de qué era */}
                        <span className="relative w-10 h-10 rounded-xl bg-black/10 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-black text-brand-500 text-[10px] font-black flex items-center justify-center tabular-nums">
                                {cart.length}
                            </span>
                        </span>

                        <span className="text-left leading-tight min-w-0">
                            <span className="block text-[12px] font-black uppercase tracking-widest">Ver mi pedido</span>
                            <span className="block text-[10px] font-bold opacity-70">
                                {cart.length === 1 ? "1 producto" : `${cart.length} productos`}
                            </span>
                        </span>

                        <span className="ml-auto flex items-center gap-1.5 shrink-0">
                            <span className="text-right leading-tight">
                                <span className="block text-[15px] font-black tabular-nums">{fmt(cartTotal, baseCur)}</span>
                                {altCur && (
                                    <span className="block text-[10px] font-bold tabular-nums opacity-70">{fmt(cartTotal, altCur)}</span>
                                )}
                            </span>
                            <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                        </span>
                    </button>
                </div>
            )}

            {/* ── Mis pedidos ── */}
            {ordersOpen && (
                <div className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOrdersOpen(false)} />
                    <div className="relative w-full sm:max-w-md bg-surface dark:bg-surface-dark-2 rounded-t-3xl sm:rounded-3xl border-t sm:border border-border dark:border-white/10 max-h-[90vh] flex flex-col">
                        <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-border dark:border-white/5">
                            <div className="min-w-0">
                                <h2 className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white">
                                    Mis pedidos
                                </h2>
                                <p className="text-[10px] font-bold text-content-muted truncate">
                                    {identity?.name} · {identity?.document}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button onClick={loadMyOrders} title="Actualizar"
                                    className="p-1.5 text-content-subtle hover:text-brand-500 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                                <button onClick={() => setOrdersOpen(false)}
                                    className="p-1.5 -mr-1.5 text-content-subtle hover:text-content dark:hover:text-white">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                            {ordersLoading && !myOrders ? (
                                <div className="py-16 text-center text-[11px] font-black uppercase tracking-widest text-content-subtle">
                                    Cargando...
                                </div>
                            ) : ordersError ? (
                                <p className="py-16 text-center text-[11px] font-bold text-danger">{ordersError}</p>
                            ) : (myOrders?.length === 0 && rejectedIds.length === 0) ? (
                                <div className="py-16 text-center space-y-1">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-content-subtle">
                                        Todavía no has pedido nada
                                    </p>
                                    <p className="text-[11px] font-bold text-content-muted">
                                        Cuando envíes tu primer pedido lo verás aquí.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {(myOrders || []).map(o => (
                                        <OrderCard key={o.id} order={o} fmt={fmt} baseCur={baseCur} />
                                    ))}
                                    {rejectedIds.map(id => (
                                        <OrderCard
                                            key={`rej-${id}`}
                                            order={{
                                                id,
                                                stage: "rechazado",
                                                stage_label: "No procesado",
                                                stage_detail: "La tienda no procesó este pedido. Consúltalo con ellos.",
                                                items: [],
                                            }}
                                            fmt={fmt}
                                            baseCur={baseCur}
                                        />
                                    ))}
                                </>
                            )}
                        </div>

                        <div className="px-4 py-3 border-t border-border dark:border-white/5 flex items-center justify-between">
                            <button onClick={forgetIdentity} className="text-[10px] font-black uppercase tracking-wide text-danger hover:underline">
                                No soy yo
                            </button>
                            {store?.whatsapp && (
                                <a
                                    href={`https://wa.me/${store.whatsapp}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-black uppercase tracking-wide text-content-subtle hover:text-brand-500"
                                >
                                    Escribir a la tienda
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Panel del pedido ── */}
            {ordersEnabled && cartOpen && (
                <div className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => (placedOrder ? closeConfirmation() : setCartOpen(false))} />
                    <div className="relative w-full sm:max-w-md bg-surface dark:bg-surface-dark-2 rounded-t-3xl sm:rounded-3xl border-t sm:border border-border dark:border-white/10 max-h-[90vh] flex flex-col">
                        <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-border dark:border-white/5">
                            <h2 className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white">
                                {placedOrder ? "Pedido enviado" : "Tu pedido"}
                            </h2>
                            <button onClick={() => (placedOrder ? closeConfirmation() : setCartOpen(false))}
                                className="p-1.5 -mr-1.5 text-content-subtle hover:text-content dark:hover:text-white">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Confirmación: el pedido ya está en el sistema de la tienda. El botón
                            de WhatsApp es opcional y solo abre la conversación — el detalle no
                            viaja por ahí, así que el mensaje es de una línea. */}
                        {placedOrder ? (
                            <div className="px-5 py-8 text-center space-y-4">
                                <div className="w-14 h-14 mx-auto rounded-2xl bg-success/10 text-success flex items-center justify-center">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-black text-content dark:text-white">
                                        Pedido #{placedOrder.id} recibido
                                    </p>
                                    <p className="text-[12px] font-bold text-content-muted leading-relaxed">
                                        {store?.name || "La tienda"} ya lo tiene en su lista. Te contactarán
                                        al {identity?.phone} para confirmarlo y enviarte la factura.
                                    </p>
                                </div>
                                <div className="text-[11px] font-black uppercase tracking-widest text-content-subtle tabular-nums">
                                    Total {fmt(placedOrder.total, baseCur)}
                                    {altCur && ` · ${fmt(placedOrder.total, altCur)}`}
                                </div>
                                {waHref && (
                                    <a
                                        href={waHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="h-11 rounded-2xl bg-[#25D366] text-black text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
                                    >
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.886-9.885 9.886m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488" /></svg>
                                        Abrir chat con la tienda
                                    </a>
                                )}
                                <div className="flex flex-col gap-2">
                                    <button onClick={() => { closeConfirmation(); openMyOrders(); }}
                                        className="text-[10px] font-black uppercase tracking-widest text-brand-500 hover:underline">
                                        Ver el estado de mi pedido
                                    </button>
                                    <button onClick={closeConfirmation}
                                        className="text-[10px] font-black uppercase tracking-widest text-content-subtle hover:text-content dark:hover:text-white">
                                        Seguir viendo el catálogo
                                    </button>
                                </div>
                            </div>
                        ) : (
                        <>
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                            {cart.map(it => (
                                <div key={it.id} className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-surface-2 dark:bg-white/5 overflow-hidden shrink-0 relative">
                                        {it.image_url ? (
                                            <img src={resolveImageUrl(it.image_url)} alt={it.name} onError={imgRetryOnError}
                                                className="absolute inset-0 w-full h-full object-cover" />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center text-base font-black text-brand-500/30">
                                                {it.name.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[11px] font-black uppercase tracking-tight text-content dark:text-white leading-tight line-clamp-2">
                                            {it.name}
                                        </div>
                                        <div className="text-[10px] font-bold text-content-muted tabular-nums">
                                            {fmtQtyUnit(it.qty, it.unit)} · {fmt(parseFloat(it.price) * it.qty, baseCur)}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <QtyBtn onClick={() => changeQty(it.id, -1)} label="Quitar uno">−</QtyBtn>
                                        <QtyBtn onClick={() => changeQty(it.id, +1)} label="Agregar uno">+</QtyBtn>
                                        <button onClick={() => removeFromCart(it.id)} title="Eliminar"
                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-content-subtle hover:text-danger transition-colors">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))}

                            <div className="pt-2 space-y-2">
                                {/* Los datos ya se dieron al entrar; aquí solo se recuerdan para
                                    que el cliente vea a nombre de quién va el pedido. */}
                                <div className="rounded-xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 px-3 py-2">
                                    <div className="text-[9px] font-black uppercase tracking-widest text-content-subtle">A nombre de</div>
                                    <div className="text-[12px] font-black text-content dark:text-white uppercase truncate">{identity?.name}</div>
                                    <div className="text-[10px] font-bold text-content-muted tabular-nums truncate">
                                        {[identity?.document, identity?.phone].filter(Boolean).join(" · ")}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-black uppercase tracking-widest text-content-subtle">Entrega o nota</label>
                                    <input
                                        value={delivery}
                                        onChange={e => setDelivery(e.target.value)}
                                        placeholder="Dirección, hora, retiro en tienda..."
                                        className="w-full h-9 mt-1 px-3 rounded-xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[12px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 placeholder:text-content-subtle"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="px-4 py-3 border-t border-border dark:border-white/5 space-y-2">
                            <div className="flex items-baseline justify-between">
                                <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Total</span>
                                <div className="text-right">
                                    <div className="text-base font-black text-content dark:text-white tabular-nums">{fmt(cartTotal, baseCur)}</div>
                                    {altCur && (
                                        <div className="text-[11px] font-black text-content-muted tabular-nums">{fmt(cartTotal, altCur)}</div>
                                    )}
                                </div>
                            </div>

                            {sendError && (
                                <p className="text-[10px] font-bold text-danger leading-relaxed">{sendError}</p>
                            )}

                            <button
                                onClick={submitOrder}
                                disabled={!canSubmit || sending}
                                className="w-full h-11 rounded-2xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-40"
                            >
                                {sending ? "Enviando..." : "Realizar pedido"}
                            </button>

                            <div className="flex items-center justify-between">
                                <button onClick={clearCart} className="text-[10px] font-black uppercase tracking-wide text-danger hover:underline">
                                    Vaciar pedido
                                </button>
                                <span className="text-[9px] font-bold text-content-subtle">
                                    {canSubmit ? "Sujeto a confirmación de la tienda" : "Completa cédula, nombre y teléfono"}
                                </span>
                            </div>
                        </div>
                        </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// Identificación previa al catálogo. Tres pasos, uno por pantalla: documento, y según
// tenga ficha o no, confirmar quién es o dejar sus datos. La ficha NO se crea aquí — se
// crea con el primer pedido, para que entrar a mirar no genere clientes fantasma.
function IdentityGate({ token, store, onIdentified }) {
    const [step, setStep]     = useState("doc"); // doc | confirm | phone | register
    const [prefix, setPrefix] = useState("V");
    const [number, setNumber] = useState("");
    const [match, setMatch]   = useState(null);  // ficha encontrada
    const [name, setName]     = useState("");
    const [phone, setPhone]   = useState("");
    const [busy, setBusy]     = useState(false);
    const [err, setErr]       = useState(null);

    // Nombre explícito: `document` a secas taparía el objeto global del DOM.
    const fullDocument = `${prefix}-${number}`;
    const phoneOk  = phone.replace(/\D/g, "").length >= 7;

    const lookup = async () => {
        if (number.length < 6 || busy) return;
        setBusy(true); setErr(null);
        try {
            const r = await publicApi.identify(token, fullDocument);
            if (r.data.found) {
                setMatch(r.data);
                // Una ficha vieja puede no tener teléfono, y el pedido lo necesita para
                // que la tienda confirme y mande la factura.
                setPhone(r.data.phone || "");
                setStep("confirm");
            } else {
                setStep("register");
            }
        } catch (e) {
            setErr(e.message || "No se pudo verificar. Intenta de nuevo.");
        } finally {
            setBusy(false);
        }
    };

    const restart = () => { setStep("doc"); setMatch(null); setName(""); setPhone(""); setErr(null); };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 bg-surface-2 dark:bg-surface-dark">
            <div className="w-full max-w-sm space-y-5">
                <div className="text-center space-y-3">
                    {store?.logo_url ? (
                        <img
                            src={resolveImageUrl(store.logo_url)}
                            alt={store.name}
                            onError={imgRetryOnError}
                            className="w-16 h-16 rounded-2xl object-cover mx-auto border border-border dark:border-white/10"
                        />
                    ) : (
                        <div className="w-16 h-16 rounded-2xl mx-auto bg-brand-500/10 flex items-center justify-center text-2xl font-black text-brand-500">
                            {(store?.name || "C").charAt(0)}
                        </div>
                    )}
                    <div>
                        <h1 className="text-base font-black text-content dark:text-white uppercase tracking-tight">
                            {store?.name || "Catálogo"}
                        </h1>
                        {store?.slogan && (
                            <p className="text-[11px] font-bold text-content-muted italic">{store.slogan}</p>
                        )}
                    </div>
                </div>

                <div className="bg-surface dark:bg-surface-dark-2 rounded-3xl border border-border dark:border-white/10 p-5 space-y-4">
                    {step === "doc" && (
                        <>
                            <div className="text-center space-y-1">
                                <h2 className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white">
                                    Identifícate para entrar
                                </h2>
                                <p className="text-[11px] font-bold text-content-muted leading-relaxed">
                                    Escribe tu cédula o RIF. Lo usamos para asociar tus pedidos y
                                    facturarte sin pedirte los datos cada vez.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <select
                                    value={prefix}
                                    onChange={e => { setPrefix(e.target.value); setNumber(n => n.slice(0, docMaxLen(e.target.value))); }}
                                    className="h-11 w-[72px] px-2 rounded-xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[13px] font-black text-center text-content dark:text-white outline-none focus:border-brand-500/60"
                                >
                                    {DOC_PREFIXES.map(p => <option key={p} value={p}>{p}-</option>)}
                                </select>
                                <input
                                    value={number}
                                    onChange={e => setNumber(e.target.value.replace(/\D/g, "").slice(0, docMaxLen(prefix)))}
                                    onKeyDown={e => e.key === "Enter" && lookup()}
                                    inputMode="numeric"
                                    autoFocus
                                    placeholder={"0".repeat(docMaxLen(prefix))}
                                    className="flex-1 h-11 px-3 rounded-xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[14px] font-black tabular-nums text-content dark:text-white outline-none focus:border-brand-500/60 placeholder:text-content-subtle"
                                />
                            </div>
                            <GateButton onClick={lookup} disabled={number.length < 6 || busy}>
                                {busy ? "Verificando..." : "Continuar"}
                            </GateButton>
                        </>
                    )}

                    {step === "confirm" && (
                        <>
                            <div className="text-center space-y-2">
                                <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                </div>
                                <p className="text-[11px] font-black uppercase tracking-widest text-content-subtle">¿Eres tú?</p>
                                <p className="text-base font-black text-content dark:text-white uppercase tracking-tight leading-tight">
                                    {match?.name}
                                </p>
                                <p className="text-[11px] font-bold text-content-muted tabular-nums">{fullDocument}</p>
                            </div>
                            <GateButton
                                onClick={() => {
                                    if (!match?.phone) return setStep("phone");
                                    onIdentified({ document: fullDocument, name: match.name, phone: match.phone });
                                }}
                            >
                                Sí, soy yo
                            </GateButton>
                            <button onClick={restart} className="w-full text-[10px] font-black uppercase tracking-widest text-content-subtle hover:text-content dark:hover:text-white">
                                No, corregir cédula
                            </button>
                        </>
                    )}

                    {step === "phone" && (
                        <>
                            <div className="text-center space-y-1">
                                <h2 className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white">
                                    Falta tu teléfono
                                </h2>
                                <p className="text-[11px] font-bold text-content-muted leading-relaxed">
                                    Es por donde te confirmamos el pedido y te enviamos la factura.
                                </p>
                            </div>
                            <GateInput value={phone} onChange={setPhone} type="tel" placeholder="0414 5550000" autoFocus
                                onEnter={() => phoneOk && onIdentified({ document: fullDocument, name: match.name, phone: phone.trim() })} />
                            <GateButton
                                onClick={() => onIdentified({ document: fullDocument, name: match.name, phone: phone.trim() })}
                                disabled={!phoneOk}
                            >
                                Entrar al catálogo
                            </GateButton>
                            <button onClick={restart} className="w-full text-[10px] font-black uppercase tracking-widest text-content-subtle hover:text-content dark:hover:text-white">
                                Volver
                            </button>
                        </>
                    )}

                    {step === "register" && (
                        <>
                            <div className="text-center space-y-1">
                                <h2 className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white">
                                    Es tu primera vez
                                </h2>
                                <p className="text-[11px] font-bold text-content-muted leading-relaxed">
                                    Deja tus datos y quedas registrado con {fullDocument}.
                                </p>
                            </div>
                            <GateInput value={name} onChange={v => setName(v.toUpperCase())} placeholder="Nombre completo" autoFocus />
                            <GateInput value={phone} onChange={setPhone} type="tel" placeholder="0414 5550000"
                                onEnter={() => name.trim().length >= 2 && phoneOk && onIdentified({ document: fullDocument, name: name.trim(), phone: phone.trim() })} />
                            <GateButton
                                onClick={() => onIdentified({ document: fullDocument, name: name.trim(), phone: phone.trim() })}
                                disabled={name.trim().length < 2 || !phoneOk}
                            >
                                Entrar al catálogo
                            </GateButton>
                            <button onClick={restart} className="w-full text-[10px] font-black uppercase tracking-widest text-content-subtle hover:text-content dark:hover:text-white">
                                Corregir cédula
                            </button>
                        </>
                    )}

                    {err && <p className="text-[11px] font-bold text-danger text-center">{err}</p>}
                </div>

                {store?.phone && (
                    <p className="text-center text-[10px] font-bold text-content-subtle">
                        ¿Problemas? Escríbenos al {store.phone}
                    </p>
                )}
            </div>
        </div>
    );
}

function GateInput({ value, onChange, placeholder, type = "text", autoFocus, onEnter }) {
    return (
        <input
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onEnter?.()}
            type={type}
            inputMode={type === "tel" ? "tel" : undefined}
            autoFocus={autoFocus}
            placeholder={placeholder}
            className="w-full h-11 px-3 rounded-xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 placeholder:text-content-subtle"
        />
    );
}

function GateButton({ onClick, disabled, children }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="w-full h-11 rounded-2xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-widest active:scale-[0.99] transition-transform disabled:opacity-40"
        >
            {children}
        </button>
    );
}

// Colores del estado. "rechazado" no viene del servidor: lo deduce el navegador cuando un
// pedido que envió ya no aparece en la lista (ver rejectedIds).
const STAGE_STYLES = {
    enviado:    "bg-warning/15 text-warning border-warning/30",
    confirmado: "bg-info/15 text-info border-info/30",
    facturado:  "bg-brand-500/15 text-brand-500 border-brand-500/30",
    pagado:     "bg-success/15 text-success border-success/30",
    anulado:    "bg-danger/15 text-danger border-danger/30",
    rechazado:  "bg-danger/15 text-danger border-danger/30",
};

function OrderCard({ order, fmt, baseCur }) {
    const style = STAGE_STYLES[order.stage] || STAGE_STYLES.enviado;
    const summary = order.items.map(i => `${i.quantity % 1 === 0 ? i.quantity : i.quantity.toFixed(3)} × ${i.name}`).join(", ");

    return (
        <div className="rounded-2xl border border-border dark:border-white/10 bg-surface-2 dark:bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-content dark:text-white">
                    Pedido #{order.id}
                </span>
                <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wide shrink-0 ${style}`}>
                    {order.stage_label}
                </span>
            </div>

            <p className="text-[11px] font-bold text-content-muted leading-relaxed">{order.stage_detail}</p>

            {summary && (
                <p className="text-[10px] font-bold text-content-subtle line-clamp-2">{summary}</p>
            )}

            <div className="flex items-end justify-between gap-2 pt-0.5">
                <div className="text-[10px] font-bold text-content-subtle">
                    {order.created_at && new Date(order.created_at).toLocaleDateString("es-VE", { day: "2-digit", month: "short" })}
                    {order.invoice_number && ` · Factura ${order.invoice_number}`}
                </div>
                {order.total != null && (
                    <div className="text-[13px] font-black text-content dark:text-white tabular-nums shrink-0">
                        {fmt(order.total, baseCur)}
                    </div>
                )}
            </div>
        </div>
    );
}

function QtyBtn({ onClick, label, children }) {
    return (
        <button
            onClick={onClick}
            aria-label={label}
            className="w-7 h-7 rounded-lg bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-content dark:text-white text-sm font-black flex items-center justify-center active:scale-90 transition-transform"
        >
            {children}
        </button>
    );
}

function CatOption({ active, onClick, children }) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all flex items-center justify-between gap-2 ${
                active
                    ? "bg-brand-500 text-black"
                    : "text-content-muted hover:bg-surface-2 dark:hover:bg-white/5 hover:text-content dark:hover:text-white"
            }`}
        >
            <span className="truncate">{children}</span>
            {active && (
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            )}
        </button>
    );
}