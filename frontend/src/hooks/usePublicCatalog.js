import { useState, useEffect, useCallback, useRef } from "react";
import { publicApi } from "../services/api";
import { isIntegerUnit } from "../helpers/unitFormatter";
import { applyBrandColor } from "../helpers/brandColor";
import { useTheme } from "./useTheme";
import { PAGE_SIZE, round3 } from "../components/PublicCatalog/shared";

/**
 * Estado y lógica del catálogo público.
 *
 * Vivía dentro de PublicCatalogPage, que acumulaba 37 useState junto a 700 líneas de JSX en
 * el mismo componente. Separarlo sigue el patrón del resto del sistema —useCatalog, usePagos,
 * useEgresos— donde la página solo compone y el hook carga con el estado.
 *
 * Todo lo que persiste va por token: el mismo navegador puede tener abiertos los catálogos de
 * dos tiendas distintas sin que se pisen el carrito ni la identidad.
 */
export function usePublicCatalog(token) {
    const { dark, toggle } = useTheme();
    const [store, setStore] = useState(null);
    const [currencies, setCurrencies] = useState([]);
    const [categories, setCategories] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [products, setProducts] = useState([]);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const reqRef = useRef(0);

    // Carrito: se guarda por token para que cerrar la pestaña sin querer no borre lo
    // que el cliente venía armando.
    const cartKey = `catalog_cart_${token}`;
    const [cart, setCart] = useState(() => {
        try { return JSON.parse(localStorage.getItem(`catalog_cart_${token}`)) || []; }
        catch { return []; }
    });
    const [cartOpen, setCartOpen] = useState(false);
    const [showCats, setShowCats] = useState(false);
    const [delivery, setDelivery] = useState("");

    // Sucursal elegida. El precio es de la empresa pero el stock es de cada local, así que
    // toda la pantalla cuelga de esto: qué productos se listan y contra qué existencias se
    // valida el pedido. Se recuerda por token —quien vuelve entra directo a su tienda de
    // siempre— y si esa sucursal deja de publicarse, `branch` queda en null y se vuelve a
    // preguntar en vez de mostrarle el catálogo de otra.
    const branchKey = `catalog_branch_${token}`;
    const [branchId, setBranchId] = useState(() => {
        try { return localStorage.getItem(`catalog_branch_${token}`) || ""; }
        catch { return ""; }
    });
    // Volver a la puerta desde la cabecera. Es un estado aparte y no un branchId vacío para
    // no perder cuál era la tienda actual: hace falta para saber si el cliente terminó
    // cambiándose o se quedó donde estaba.
    const [switchingBranch, setSwitchingBranch] = useState(false);

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

    // Salir con el carrito lleno se pregunta: cerrar sesión también olvida la tienda, y con
    // ella lo que el cliente venía armando deja de tener sentido.
    const [logoutAsk, setLogoutAsk] = useState(false);
    const requestLogout = () => {
        if (cart.length > 0) return setLogoutAsk(true);
        forgetIdentity();
    };
    const confirmLogout = () => { setLogoutAsk(false); forgetIdentity(); };
    const cancelLogout = () => setLogoutAsk(false);

    const [profileOpen, setProfileOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState(false);
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");

    const openProfileModal = () => {
        if (!identity) return;
        setEditName(identity.name || "");
        setEditPhone(identity.phone || "");
        setEditingProfile(false);
        setProfileOpen(true);
    };

    const handleSaveProfile = () => {
        if (!identity) return;
        const updated = {
            ...identity,
            name: editName.trim(),
            phone: editPhone.trim(),
        };
        saveIdentity(updated);
        setEditingProfile(false);
    };

    const forgetIdentity = () => {
        setIdentity(null);
        setCartOpen(false);
        setOrdersOpen(false);
        setProfileOpen(false);
        setSelectedOrder(null);
        // Cerrar sesión es empezar de cero: también se olvida la tienda elegida, así que al
        // volver a identificarse el cliente puede escoger otra. El carrito se va con ella
        // porque lo que había dentro era stock de la sucursal anterior.
        setBranchId("");
        setSwitchingBranch(false);
        setCart([]);
        try {
            localStorage.removeItem(identityKey);
            localStorage.removeItem(branchKey);
        } catch { /* modo privado */ }
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
    const [selectedOrder, setSelectedOrder] = useState(null);
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

    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState(null);
    // Pedido ya registrado en el servidor. Mientras exista, el panel muestra la
    // confirmación en vez del carrito.
    const [placedOrder, setPlacedOrder] = useState(null);
    // Clave de idempotencia del envío en curso: sobrevive a los reintentos y solo se
    // renueva cuando el pedido entra. Sin ella, un doble toque o un reintento por señal
    // mala le deja al comercio el mismo pedido dos veces en la lista.
    const orderKeyRef = useRef(null);

    useEffect(() => {
        try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch { /* modo privado */ }
    }, [cart, cartKey]);

    const baseCur = currencies.find(c => c.is_base) || null;
    const altCur = currencies.find(c => !c.is_base) || null;

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

    // Con una sola tienda publicada no hay nada que preguntar. Con ninguna —la empresa no
    // marcó ningún almacén como local de venta— se sigue con el stock de la empresa, que es
    // como funcionaba el catálogo antes de que existieran las sucursales.
    const branch = warehouses.find(w => String(w.id) === String(branchId))
        || (warehouses.length === 1 ? warehouses[0] : null);
    // Va después de la identificación: primero el cliente dice quién es y recién entonces
    // elige tienda. Al revés, quien cerraba sesión volvía a la cédula pero ya no podía
    // cambiar de sucursal, porque la elección seguía guardada de la visita anterior.
    const branchGate = !!store && !gated && warehouses.length > 1 && (!branch || switchingBranch);

    const chooseBranch = (id) => {
        // Cambiar de tienda cambia el catálogo: lo que estaba en el carrito puede no existir
        // en la otra. Se vacía en vez de dejar que el pedido lo rechace línea por línea.
        if (branch && String(branch.id) !== String(id)) setCart([]);
        setBranchId(String(id));
        setSwitchingBranch(false);
        setCartOpen(false);
        try { localStorage.setItem(branchKey, String(id)); } catch { /* modo privado */ }
    };

    const cartTotal = cart.reduce((sum, it) => sum + parseFloat(it.price) * (parseFloat(it.qty) || 0), 0);

    // Paso de cantidad: las unidades contables van de uno en uno; peso y volumen admiten
    // medios, que es como se pide en mostrador ("medio kilo").
    const stepFor = (unit) => (isIntegerUnit(unit) ? 1 : 0.5);

    const addToCart = (p) => {
        setCart(prev => {
            const found = prev.find(it => it.id === p.id);
            if (found) {
                const currentQty = typeof found.qty === "number" ? found.qty : (parseFloat(found.qty) || 0);
                return prev.map(it => it.id === p.id ? { ...it, qty: round3(currentQty + stepFor(it.unit)) } : it);
            }
            return [...prev, { id: p.id, name: p.name, price: p.price, unit: p.unit, image_url: p.image_url, qty: stepFor(p.unit) }];
        });
    };

    const changeQty = (id, delta) => {
        setCart(prev => prev.flatMap(it => {
            if (it.id !== id) return [it];
            const currentQty = typeof it.qty === "number" ? it.qty : (parseFloat(it.qty) || 0);
            const next = round3(currentQty + delta * stepFor(it.unit));
            return next > 0 ? [{ ...it, qty: next }] : [];
        }));
    };

    const setQtyDirect = (id, raw) => {
        if (raw === "") {
            setCart(prev => prev.map(it => it.id === id ? { ...it, qty: "" } : it));
            return;
        }
        let targetNq = parseFloat(raw);
        if (isNaN(targetNq)) return;
        setCart(prev => prev.map(it => {
            if (it.id !== id) return it;
            const isInt = isIntegerUnit(it.unit);
            let nq = targetNq;
            if (isInt) {
                nq = Math.floor(nq);
            } else {
                nq = round3(nq);
            }
            return { ...it, qty: nq };
        }));
    };

    const handleQtyBlur = (id, unit) => {
        setCart(prev => prev.flatMap(it => {
            if (it.id !== id) return [it];
            const num = parseFloat(it.qty);
            if (isNaN(num) || num <= 0) {
                const minVal = isIntegerUnit(unit) ? 1 : stepFor(unit);
                return [{ ...it, qty: minVal }];
            }
            return [it];
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
                // El pedido nace en la tienda que el cliente eligió: es contra ese stock que
                // se valida y es esa caja la que lo verá.
                warehouse_id: branch?.id || null,
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
                // El catálogo hereda el color de la empresa: para el cliente final esta
                // página es la tienda, no un módulo del POS.
                if (r.data.store?.brand_color) applyBrandColor(r.data.store.brand_color);
                setCurrencies(r.data.currencies || []);
                setCategories(r.data.categories || []);
                setWarehouses(r.data.warehouses || []);
            })
            .catch(() => alive && setError("Este catálogo no está disponible."));
        return () => { alive = false; };
    }, [token]);

    // Productos: se recargan al buscar o cambiar de categoría (con debounce en la búsqueda).
    // Mientras el visitante no se identifique no se pide nada: la pantalla que vería son
    // los datos de la tienda, no un catálogo.
    // Tampoco antes de tener la tienda: hasta que no se sepa si hay sucursales, pedir
    // productos sería listar el stock de todas para reemplazarlo enseguida.
    useEffect(() => {
        if (!store || gated || branchGate) return;
        const id = ++reqRef.current;
        setLoading(true);
        const t = setTimeout(() => {
            publicApi.getProducts(token, { search, category_id: category, limit: PAGE_SIZE, offset: 0, warehouse_id: branch?.id || "" })
                .then(r => {
                    if (id !== reqRef.current) return; // llegó tarde, ya hay otra búsqueda
                    setProducts(r.data.products || []);
                    setTotal(r.data.total || 0);
                })
                .catch(() => id === reqRef.current && setError("No se pudieron cargar los productos."))
                .finally(() => id === reqRef.current && setLoading(false));
        }, search ? 300 : 0);
        return () => clearTimeout(t);
    }, [token, search, category, gated, store, branchGate, branch?.id]);

    // Una carga al entrar para que el distintivo de "Mis pedidos" diga algo desde el
    // principio. No se repite sola: quien esté esperando abre el panel y ve el estado
    // fresco, sin dejar el teléfono consultando en bucle.
    useEffect(() => {
        if (identity && !gated) loadMyOrders();
    }, [identity, gated, loadMyOrders]);

    const loadMore = useCallback(() => {
        if (loadingMore || products.length >= total) return;
        setLoadingMore(true);
        publicApi.getProducts(token, { search, category_id: category, limit: PAGE_SIZE, offset: products.length, warehouse_id: branch?.id || "" })
            .then(r => setProducts(p => [...p, ...(r.data.products || [])]))
            .catch(() => { })
            .finally(() => setLoadingMore(false));
    }, [token, search, category, products.length, total, loadingMore, branch?.id]);

    return {
        // tema
        dark, toggle,
        // tienda y catálogo
        store, currencies, categories, products, total, error,
        search, setSearch, category, setCategory,
        loading, loadingMore, loadMore,
        baseCur, altCur, fmt, ordersEnabled, gated,
        // sucursal
        warehouses, branch, branchGate, chooseBranch, openBranchGate: () => setSwitchingBranch(true),
        // carrito
        cart, cartTotal, cartOpen, setCartOpen,
        addToCart, changeQty, setQtyDirect, handleQtyBlur, removeFromCart, clearCart,
        showCats, setShowCats, delivery, setDelivery,
        // identidad y perfil
        identity, saveIdentity, forgetIdentity,
        requestLogout, logoutAsk, confirmLogout, cancelLogout,
        profileOpen, setProfileOpen, openProfileModal, handleSaveProfile,
        editingProfile, setEditingProfile,
        editName, setEditName, editPhone, setEditPhone,
        // pedidos
        ordersOpen, setOrdersOpen, openMyOrders, loadMyOrders,
        myOrders, ordersLoading, ordersError,
        selectedOrder, setSelectedOrder,
        rejectedIds, openOrdersCount,
        // envío
        canSubmit, submitOrder, sending, sendError,
        placedOrder, closeConfirmation, waHref,
    };
}
