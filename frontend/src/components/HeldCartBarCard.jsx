import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { api } from "../services/api";
import { fmtMoney } from "../helpers";
import { isIntegerUnit } from "../helpers/unitFormatter";

// Cuánto se espera desde el último toque antes de mandar la ronda al servidor. Cada guardado
// reescribe las líneas de la venta y mueve inventario (ver updateSale), así que agrupar los
// toques importa: tres cervezas seguidas tienen que salir en una sola llamada, no en tres.
const SAVE_DELAY = 900;

// Redondeo a 3 decimales, el mismo que usa el carrito para no arrastrar 0.30000000000000004.
const round3 = (n) => parseFloat((parseFloat(n) || 0).toFixed(3));

const fromCart = (cart) => (cart.items || []).map(i => ({
    product_id: i.product_id,
    name: i.name,
    price: parseFloat(i.price),
    qty: parseFloat(i.quantity),
    // Cantidad que esta cuenta ya tiene apartada en el inventario. Es lo que hay que
    // devolverle al stock del almacén para saber hasta dónde se puede subir la línea:
    // el almacén ya reporta descontado lo que la cuenta se llevó.
    reserved: parseFloat(i.quantity),
}));

// Firma de lo que el servidor dice que tiene la cuenta. Sirve para re-sincronizar la tarjeta
// cuando el listado se recarga solo (cada 25 s) sin pisar lo que el cajero está tocando.
const signature = (cart) => (cart.items || [])
    .map(i => `${i.product_id}:${i.quantity}:${i.price}`).join("|");

/**
 * Una cuenta en espera con sus líneas editables en sitio: subir y bajar cantidades o agregar
 * productos sin llevarla al carrito. Es el flujo del bar —el cliente pide otra cerveza y hay
 * que sumarla a la mesa sin pausar, recuperar, sumar y volver a pausar—.
 *
 * Cada cambio se guarda solo: se reclama la cuenta (claim) para que ninguna otra caja la esté
 * cobrando en ese instante y se manda el PATCH, que al terminar la suelta de nuevo.
 */
export default function HeldCartBarCard({
    cart, products, searchProducts, onProductFound, hasMoreProducts,
    expanded, onToggle, onSaved, notify,
    editable, lockedReason, onRemove, onPrint, onTake, takeLabel = "Cobrar",
    convertToDisplay, convertToSecondary, currSym, secondaryCurrency,
}) {
    const [lines, setLines] = useState(() => fromCart(cart));
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState(null);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    // `dirty` va en estado y en ref: el estado pinta el rótulo "Pendiente" y bloquea el botón
    // de cobrar, y el ref es el que leen los efectos de guardado, que corren fuera del render.
    const [dirty, setDirty] = useState(false);

    const dirtyRef = useRef(false);
    const savingRef = useRef(false);
    const pendingRef = useRef(false);   // llegó otro toque mientras se guardaba
    const linesRef = useRef(lines);
    const cartRef = useRef(cart);
    const flushRef = useRef(null);

    useEffect(() => { linesRef.current = lines; }, [lines]);
    useEffect(() => { cartRef.current = cart; }, [cart]);

    // El listado se recarga solo cada tanto. Si el cajero no tiene nada a medio guardar, la
    // tarjeta se pone al día con el servidor —otra caja pudo agregarle algo a esta misma
    // mesa—; si lo tiene, se respeta lo que está en pantalla.
    const sig = signature(cart);
    useEffect(() => {
        if (dirtyRef.current || savingRef.current) return;
        setLines(fromCart(cartRef.current));
        setError(null);
    }, [sig]);

    const productMap = useMemo(
        () => Object.fromEntries((products || []).map(p => [p.id, p])),
        [products]
    );

    // Techo de una línea: lo que queda en el almacén más lo que esta misma cuenta tiene
    // apartado. Sin sumar lo apartado, una mesa con las 9 últimas cervezas no podría ni
    // quedarse como está: el almacén reporta 0 y el botón [+] se bloquearía de entrada.
    const maxFor = useCallback((line) => {
        const p = productMap[line.product_id];
        if (!p) return Infinity;                       // producto de otro almacén: decide el servidor
        if (p.is_service) return Infinity;
        if (p.is_combo && p.stock === null) return Infinity;
        return parseFloat(p.stock || 0) + (line.reserved || 0);
    }, [productMap]);

    const stepFor = useCallback((line) => {
        const p = productMap[line.product_id];
        return parseFloat(p?.qty_step) || 1;
    }, [productMap]);

    // ── Guardado ──────────────────────────────────────────────
    const doSave = useCallback(async () => {
        const valid = linesRef.current.filter(l => parseFloat(l.qty) > 0);
        // Una cuenta sin líneas no se guarda: el servidor la rechaza y, sobre todo, vaciarla
        // no es lo mismo que cerrarla. Para eso está el botón de eliminar la cuenta.
        if (!valid.length) return;
        if (savingRef.current) { pendingRef.current = true; return; }

        savingRef.current = true;
        setSaving(true);
        setError(null);
        let claimed = false;
        try {
            // Reclamarla es lo que impide que la ronda entre justo mientras otra caja la
            // está cobrando: si la tiene tomada, esto responde 409 y no se toca nada.
            await api.sales.claim(cartRef.current.id);
            claimed = true;
            await api.sales.update(cartRef.current.id, {
                items: valid.map(l => ({ product_id: l.product_id, qty: l.qty, price: l.price })),
            });
            // El PATCH suelta la cuenta al terminar (ver updateSale), así que no queda
            // bloqueada a nombre de esta caja.
            dirtyRef.current = false;
            setDirty(false);
            setSavedAt(Date.now());
            onSaved?.();
        } catch (e) {
            const msg = e.message || "No se pudo guardar la ronda";
            setError(msg);
            notify?.(msg, "err");
            if (claimed) api.sales.release(cartRef.current.id).catch(() => { });
            // Se vuelve a lo que dice el servidor: dejar en pantalla una cantidad que no se
            // guardó es peor que perder el toque, porque la mesa se cobraría con otra cifra.
            dirtyRef.current = false;
            setDirty(false);
            setLines(fromCart(cartRef.current));
        } finally {
            savingRef.current = false;
            setSaving(false);
            if (pendingRef.current) { pendingRef.current = false; doSave(); }
        }
    }, [notify, onSaved]);

    useEffect(() => { flushRef.current = doSave; }, [doSave]);

    // Retardo tras el último toque
    useEffect(() => {
        if (!dirtyRef.current) return;
        const t = setTimeout(() => flushRef.current?.(), SAVE_DELAY);
        return () => clearTimeout(t);
    }, [lines]);

    // Cerrar la tarjeta guarda ya: el cajero da por terminada la ronda y se va a la siguiente
    // mesa, no tiene por qué esperar el retardo.
    useEffect(() => {
        if (!expanded && dirtyRef.current) flushRef.current?.();
    }, [expanded]);

    // Y si el modal se cierra con algo pendiente, se manda igual. Sin esto, cerrar antes de
    // que venciera el retardo perdía la última cerveza en silencio.
    useEffect(() => () => { if (dirtyRef.current) flushRef.current?.(); }, []);

    // ── Ediciones ─────────────────────────────────────────────
    const touch = (updater) => {
        dirtyRef.current = true;
        setDirty(true);
        setError(null);
        setLines(updater);
    };

    const bump = (productId, dir) => {
        const line = linesRef.current.find(l => l.product_id === productId);
        if (!line) return;
        const p = productMap[productId];
        const step = stepFor(line);
        let next = round3(line.qty + dir * step);
        if (isIntegerUnit(p?.unit)) next = Math.floor(next);
        if (next < step) return;                       // por debajo del paso se elimina, no se baja
        if (dir > 0 && next > maxFor(line)) {
            return notify?.("Stock límite alcanzado", "err");
        }
        touch(prev => prev.map(l => l.product_id === productId ? { ...l, qty: next } : l));
    };

    const setQty = (productId, raw) => {
        const line = linesRef.current.find(l => l.product_id === productId);
        if (!line) return;
        const p = productMap[productId];
        let next = parseFloat(String(raw).replace(",", "."));
        if (isNaN(next) || next < 0) next = 0;
        if (isIntegerUnit(p?.unit)) next = Math.floor(next);
        const max = maxFor(line);
        if (next > max) {
            notify?.("Stock límite alcanzado", "err");
            next = max;
        }
        touch(prev => prev.map(l => l.product_id === productId ? { ...l, qty: round3(next) } : l));
    };

    const dropLine = (productId) => {
        touch(prev => prev.filter(l => l.product_id !== productId));
    };

    const addProduct = (p) => {
        // Si vino del servidor todavía no está en el mapa que da unidad, paso y existencias.
        onProductFound?.(p);
        const existing = linesRef.current.find(l => l.product_id === p.id);
        if (existing) {
            setSearch("");
            return bump(p.id, 1);
        }
        const step = parseFloat(p.qty_step) || 1;
        const nueva = { product_id: p.id, name: p.name, price: parseFloat(p.price), qty: step, reserved: 0 };
        if (step > maxFor(nueva)) return notify?.("Sin stock disponible", "err");
        setSearch("");
        touch(prev => [...prev, nueva]);
    };

    // ── Buscador de productos (sobre la lista ya cargada del almacén) ──
    // Filtrar en memoria y no contra el servidor: en una barra el producto tiene que aparecer
    // en el mismo momento en que se teclea, sin esperar una ida y vuelta por cada letra.
    const locales = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        return (products || [])
            .filter(p => p.name.toLowerCase().includes(q) || (p.barcode || "").toLowerCase().includes(q))
            .slice(0, 6);
    }, [search, products]);

    // Solo si el almacén tiene más productos de los que se cargaron y ninguno de los cargados
    // coincide: es la cola larga del catálogo, la que no se toca en una barra pero tiene que
    // poder agregarse igual.
    const [remotos, setRemotos] = useState([]);
    useEffect(() => {
        const q = search.trim();
        if (!hasMoreProducts || q.length < 2 || locales.length > 0) { setRemotos([]); return; }
        const t = setTimeout(async () => {
            try { setRemotos(await searchProducts(q)); } catch { setRemotos([]); }
        }, 300);
        return () => clearTimeout(t);
    }, [search, locales.length, hasMoreProducts, searchProducts]);

    const resultados = locales.length ? locales : remotos;

    // La lista empuja la tarjeta hacia abajo, y si la cuenta estaba al final de la pantalla
    // los resultados nacían fuera de la vista. Se acerca lo justo para verlos.
    const resultsRef = useRef(null);
    useEffect(() => {
        if (!resultados.length) return;
        const t = setTimeout(() => resultsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
        return () => clearTimeout(t);
    }, [resultados.length]);

    // ── Totales ───────────────────────────────────────────────
    // Se calculan en vivo con lo que hay en pantalla, sin esperar al servidor: el descuento y
    // el recargo ya guardados se conservan tal cual (updateSale no los toca si no viajan).
    const subtotal = lines.reduce((acc, l) => acc + Math.round(l.price * 100) / 100 * l.qty, 0);
    const extras = parseFloat(cart.service_charge || 0) - parseFloat(cart.discount_amount || 0);
    const total = Math.max(0, subtotal + extras);
    const sym = currSym || "Ref.";
    const totalDisplay = convertToDisplay ? convertToDisplay(total) : total;
    const totalSecondary = convertToSecondary ? convertToSecondary(total) : null;
    const isWebOrder = cart.status === "pedido";

    const estado = saving
        ? { txt: "Guardando", cls: "text-content-subtle" }
        : error
            ? { txt: "Sin guardar", cls: "text-danger" }
            : dirty
                ? { txt: "Pendiente", cls: "text-warning" }
                : savedAt
                    ? { txt: "Guardado", cls: "text-success" }
                    : null;

    return (
        <div className={`rounded-2xl border overflow-hidden transition-all ${
            expanded
                ? "bg-surface-1 dark:bg-white/[0.04] border-brand-500/40"
                : isWebOrder
                    ? "bg-info/[0.06] border-info/25"
                    : "bg-surface-1 dark:bg-white/[0.03] border-black/5 dark:border-white/5"
        }`}>
            {/* Cabecera: un toque abre la cuenta. En tablet es todo el bloque, no un icono. */}
            <button
                onClick={onToggle}
                className="w-full px-3 py-2.5 flex items-center gap-3 text-left"
            >
                <div className="w-10 h-10 rounded-xl bg-surface-2 dark:bg-black/20 flex flex-col items-center justify-center text-center shrink-0">
                    <span className="text-[9px] font-black leading-none opacity-40">
                        {new Date(cart.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={`text-xs font-black ${isWebOrder ? "text-info" : "text-brand-500"}`}>{lines.length}</span>
                    <span className="text-[7px] font-black uppercase opacity-40">items</span>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        {isWebOrder && (
                            <span className="text-[8px] font-black uppercase tracking-widest bg-info text-white px-1.5 py-0.5 rounded shrink-0">Web</span>
                        )}
                        <span className={`text-[10px] font-black uppercase tracking-widest truncate ${isWebOrder ? "text-info" : "text-brand-500"}`}>
                            {cart.customer_name || cart.web_customer_name || "Cliente General"}
                        </span>
                    </div>
                    <div className="text-base font-black tracking-tight text-content dark:text-white tabular-nums leading-tight">
                        {fmtMoney(totalDisplay, sym)}
                    </div>
                    {secondaryCurrency && totalSecondary !== null && (
                        <div className="text-[10px] font-bold text-content-subtle dark:text-white/50 tabular-nums">
                            ≈ {fmtMoney(totalSecondary, secondaryCurrency.symbol)}
                        </div>
                    )}
                </div>

                {estado && (
                    <span className={`text-[9px] font-black uppercase tracking-widest shrink-0 flex items-center gap-1 ${estado.cls}`}>
                        {saving && (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                            </svg>
                        )}
                        {estado.txt}
                    </span>
                )}

                <svg className={`w-4 h-4 shrink-0 text-content-subtle transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {expanded && (
                <div className="px-3 pb-3 pt-1 border-t border-black/5 dark:border-white/[0.06] space-y-1.5">
                    {/* Cuenta que no se puede tocar desde aquí: se dice por qué en vez de
                        mostrar botones que van a fallar al guardar. */}
                    {!editable && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-warning/10 text-warning">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0l-7.1 12.25A2 2 0 004.99 19z" />
                            </svg>
                            <span className="text-[9px] font-black uppercase tracking-widest">{lockedReason}</span>
                        </div>
                    )}

                    {lines.length === 0 && (
                        <div className="py-4 text-center text-[10px] font-black uppercase tracking-widest text-content-subtle opacity-50">
                            La cuenta quedó vacía · agrega algo o elimínala
                        </div>
                    )}

                    {lines.map(l => {
                        const p = productMap[l.product_id];
                        const entera = isIntegerUnit(p?.unit);
                        const enTope = editable && l.qty >= maxFor(l);
                        return (
                            <div key={l.product_id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2 dark:bg-black/20">
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-black text-content dark:text-white truncate leading-tight">{l.name}</div>
                                    <div className="text-[9px] font-bold text-content-subtle tabular-nums">
                                        {fmtMoney(convertToDisplay ? convertToDisplay(l.price) : l.price, sym)}
                                        {" · "}
                                        {fmtMoney(convertToDisplay ? convertToDisplay(l.price * l.qty) : l.price * l.qty, sym)}
                                    </div>
                                </div>

                                {editable ? (
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => bump(l.product_id, -1)}
                                            className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 text-content dark:text-white flex items-center justify-center active:scale-95 transition-all"
                                            title="Quitar uno"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={3} d="M5 12h14" /></svg>
                                        </button>
                                        <input
                                            value={l.qty}
                                            onChange={e => setQty(l.product_id, e.target.value)}
                                            onFocus={e => e.target.select()}
                                            inputMode={entera ? "numeric" : "decimal"}
                                            className="w-14 h-10 rounded-xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 text-center text-sm font-black tabular-nums text-content dark:text-white outline-none focus:border-brand-500/50"
                                        />
                                        <button
                                            onClick={() => bump(l.product_id, 1)}
                                            disabled={enTope}
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
                                                enTope
                                                    ? "bg-surface-3 dark:bg-white/5 text-content-subtle opacity-40"
                                                    : "bg-brand-500 text-brand-900"
                                            }`}
                                            title={enTope ? "Sin más existencias" : "Agregar uno"}
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={3} d="M12 5v14M5 12h14" /></svg>
                                        </button>
                                        <button
                                            onClick={() => dropLine(l.product_id)}
                                            className="w-8 h-10 rounded-xl text-content-subtle hover:text-danger transition-all flex items-center justify-center"
                                            title="Quitar de la cuenta"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-sm font-black tabular-nums text-content dark:text-white shrink-0 px-2">{l.qty}</span>
                                )}
                            </div>
                        );
                    })}

                    {/* Agregar otro producto */}
                    {editable && (
                        <div className="relative pt-1">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
                            </svg>
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="input h-10 pl-9 text-[11px] w-full"
                                placeholder="Agregar otro producto..."
                            />
                            {/* Los resultados van en el flujo de la tarjeta, no flotando sobre
                                ella: como desplegable quedaban cortados por el borde de la
                                tarjeta y por el propio scroll de la lista de cuentas, y del
                                producto de abajo solo se veía media línea. */}
                            {search.trim().length >= 2 && resultados.length === 0 && (
                                <div className="mt-1.5 px-3 py-3 rounded-xl bg-surface-2 dark:bg-black/20 text-[10px] font-black uppercase tracking-widest text-content-subtle text-center">
                                    Sin coincidencias
                                </div>
                            )}
                            {resultados.length > 0 && (
                                <div ref={resultsRef} className="mt-1.5 rounded-xl border border-black/5 dark:border-white/10 overflow-hidden divide-y divide-black/5 dark:divide-white/5">
                                    {resultados.map(p => {
                                        const sinStock = !p.is_service && !(p.is_combo && p.stock === null) && parseFloat(p.stock || 0) <= 0;
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => addProduct(p)}
                                                disabled={sinStock}
                                                className={`w-full flex items-center justify-between gap-3 px-3 h-11 text-left transition-colors ${
                                                    sinStock
                                                        ? "opacity-40 bg-surface-2 dark:bg-black/20"
                                                        : "bg-surface-2 dark:bg-black/20 hover:bg-brand-500/10 active:bg-brand-500/20"
                                                }`}
                                            >
                                                <span className="text-[11px] font-black text-content dark:text-white truncate">{p.name}</span>
                                                <span className="text-[10px] font-black text-brand-500 shrink-0 tabular-nums">
                                                    {sinStock ? "Sin stock" : fmtMoney(convertToDisplay ? convertToDisplay(p.price) : p.price, sym)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-danger/10">
                            <span className="text-[9px] font-black uppercase tracking-widest text-danger truncate">{error}</span>
                            <button
                                onClick={() => { dirtyRef.current = true; setDirty(true); flushRef.current?.(); }}
                                className="text-[9px] font-black uppercase tracking-widest text-danger underline shrink-0"
                            >
                                Reintentar
                            </button>
                        </div>
                    )}

                    {/* Acciones de siempre: la ronda se agrega aquí, pero cobrar sigue pasando
                        por el carrito. */}
                    <div className="flex items-center gap-1.5 pt-1">
                        <button
                            onClick={() => onRemove(cart.id)}
                            className="w-10 h-10 shrink-0 rounded-xl bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all flex items-center justify-center"
                            title="Eliminar la cuenta"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                        <button
                            onClick={() => onPrint(cart)}
                            className="w-10 h-10 shrink-0 rounded-xl bg-surface-2 dark:bg-white/5 text-content-subtle hover:bg-brand-500 hover:text-brand-900 transition-all flex items-center justify-center"
                            title="Ver el pedido e imprimir la comanda"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        </button>
                        <button
                            onClick={() => onTake(cart.id)}
                            disabled={saving || dirty}
                            className={`flex-1 h-10 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                                saving || dirty
                                    ? "bg-surface-3 dark:bg-white/5 text-content-subtle"
                                    : "bg-brand-500 text-brand-900 hover:bg-brand-600 shadow-lg shadow-brand-500/20"
                            }`}
                            title="Llevarla al carrito para cobrarla"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            {takeLabel}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}