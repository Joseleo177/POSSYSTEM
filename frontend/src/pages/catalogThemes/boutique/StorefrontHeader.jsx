import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getSocialLinks } from "./socialLinks";
import StoreLogo from "./StoreLogo";
import { toNameCase, resolveImageUrl, imgRetryOnError } from "../../../helpers";

// Cabecera de tienda de marca: franja de anuncio, logo centrado, iconos de cliente y una
// barra de menú con las categorías que la tienda destacó.
//
// Se aparta del StoreHeader estándar en una cosa de fondo: aquí el catálogo se presenta como
// una tienda, no como una lista de productos con buscador. Por eso el logo manda, el menú es
// horizontal y la búsqueda se abre cuando se pide — en el estándar la búsqueda está siempre
// visible porque allí es la forma principal de moverse.
//
// El menú sale de `menu` (Ajustes → Vitrina). Sin menú configurado cae a las categorías que
// tengan productos publicados, para que la tienda nunca se vea con la barra vacía.

const IconBtn = ({ onClick, label, badge, children }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="relative w-9 h-9 rounded-full flex items-center justify-center text-content dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors active:scale-95"
    >
        {children}
        {badge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                {badge}
            </span>
        )}
    </button>
);

// La barra de categorías. Antes era la fila de pestañas subrayadas de cualquier plantilla; ahora
// cada categoría lleva su foto en miniatura y la elegida se marca con una píldora que SE
// DESLIZA desde la anterior, en vez de que una raya se apague aquí y se encienda allá: el ojo
// sigue el movimiento y entiende qué cambió.
//
// Desplazable en horizontal: en un teléfono no caben cinco categorías y partirlas en dos filas
// descoloca la cabecera. Al elegir una que asoma a medias, el carril la trae al centro.
function MenuCategorias({ entradas, categories, category, setCategory }) {
    const carril = useRef(null);
    const botones = useRef(new Map());
    const [pildora, setPildora] = useState(null);
    // La primera medida se pinta sin transición: si no, la píldora entraría deslizándose
    // desde el borde izquierdo al cargar la página.
    const [lista, setLista] = useState(false);
    const activa = category ? String(category) : "";
    const fotoDe = (id) => categories.find((c) => c.id === id)?.image_url || null;

    const medir = useCallback(() => {
        const b = botones.current.get(activa);
        if (!b) { setPildora(null); return; }
        setPildora({ x: b.offsetLeft, w: b.offsetWidth });
    }, [activa]);

    useLayoutEffect(() => { medir(); }, [medir, entradas.length]);
    useEffect(() => {
        if (pildora && !lista) requestAnimationFrame(() => setLista(true));
    }, [pildora, lista]);
    useEffect(() => {
        const el = carril.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        // Las fuentes web cambian el ancho del texto al terminar de cargar.
        document.fonts?.ready?.then(medir);
        return () => ro.disconnect();
    }, [medir]);

    useEffect(() => {
        const b = botones.current.get(activa);
        const el = carril.current;
        if (!b || !el || el.scrollWidth <= el.clientWidth) return;
        el.scrollTo({ left: b.offsetLeft - (el.clientWidth - b.offsetWidth) / 2, behavior: "smooth" });
    }, [activa]);

    const items = [{ key: "", label: "Todo", foto: null }, ...entradas.map((e) => ({
        key: String(e.category_id), label: toNameCase(e.label), foto: fotoDe(e.category_id), badge: e.badge,
    }))];

    return (
        <nav className="border-t border-border/40 dark:border-white/[0.04]">
            <div ref={carril} className="relative max-w-6xl mx-auto px-4 py-2 flex items-center gap-1 overflow-x-auto scrollbar-hide">
                {pildora && (
                    <span
                        aria-hidden="true"
                        className={`absolute top-2 h-9 rounded-full bg-brand-500/10 dark:bg-brand-500/20 ring-1 ring-inset ring-brand-500/25 ${lista ? "transition-[transform,width] duration-500 ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none" : ""}`}
                        style={{ left: 0, width: pildora.w, transform: `translateX(${pildora.x}px)` }}
                    />
                )}
                {items.map((it) => {
                    const sel = it.key === activa;
                    return (
                        <button
                            key={it.key || "todo"}
                            ref={(n) => { if (n) botones.current.set(it.key, n); else botones.current.delete(it.key); }}
                            type="button"
                            onClick={() => setCategory(it.key)}
                            aria-current={sel ? "page" : undefined}
                            className={`relative shrink-0 h-9 rounded-full flex items-center gap-2 text-[13px] font-semibold whitespace-nowrap transition-colors duration-300 ${it.foto || !it.key ? "pl-1 pr-3.5" : "px-3.5"} ${sel
                                ? "text-brand-600 dark:text-brand-400"
                                : "text-content-muted hover:text-content dark:hover:text-white"}`}
                        >
                            {it.key === "" ? (
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-300 ${sel ? "bg-brand-500 text-white" : "bg-surface-2 dark:bg-white/[0.06]"}`}>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" />
                                    </svg>
                                </span>
                            ) : it.foto && (
                                <img src={resolveImageUrl(it.foto)} alt="" loading="lazy" onError={imgRetryOnError}
                                    className={`w-7 h-7 rounded-full object-cover ring-2 transition-[box-shadow,transform] duration-300 ${sel ? "ring-brand-500 scale-105" : "ring-transparent"}`} />
                            )}
                            {it.label}
                            {it.badge && (
                                <span className="px-1.5 py-px rounded-full bg-brand-500 text-white text-[9px] font-semibold">
                                    {it.badge}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

export default function StorefrontHeader({
    store, identity, categories, menu,
    search, setSearch, category, setCategory,
    openOrdersCount, onOpenMyOrders, onOpenProfile,
    branch, canChangeBranch, onChangeBranch,
    cartCount, cartTotal, fmt, baseCur, onOpenCart, ordersEnabled,
    dark, toggle, onGoHome,
}) {
    const [searchOpen, setSearchOpen] = useState(false);

    // Con menú configurado manda ese; si no, las categorías publicadas. En los dos casos la
    // barra lleva delante un "Todo" que limpia el filtro.
    const entradas = menu?.length
        ? menu
        : categories.map((c) => ({ category_id: c.id, label: c.name, badge: null }));

    const redes = getSocialLinks(store);

    return (
        <header className="sticky top-0 z-30">
            {/* La franja se muestra con anuncio, con redes, o con las dos — antes solo existía
                si había un anuncio cargado, así que las redes quedaban enterradas hasta el pie
                de la página y nadie las veía sin desplazarse hasta el final. El texto va en un
                espaciador que crece (flex-1): vacío cuando no hay anuncio, empuja los íconos
                al borde derecho igual que si hubiera texto — así siempre quedan en el mismo
                sitio, con o sin franja de anuncio encima. */}
            {(store?.announcement?.text || redes.length > 0) && (
                <div className="bg-brand-500 text-white">
                    <div className="max-w-6xl mx-auto px-4 h-9 flex items-center gap-3">
                        <div className="flex-1 min-w-0 text-center">
                            {store?.announcement?.text && (
                                store.announcement.link ? (
                                    <a href={store.announcement.link} className="text-[12px] font-semibold hover:underline truncate inline-block max-w-full align-middle">
                                        {store.announcement.text}
                                    </a>
                                ) : (
                                    <span className="text-[12px] font-semibold truncate inline-block max-w-full align-middle">
                                        {store.announcement.text}
                                    </span>
                                )
                            )}
                        </div>

                        {redes.length > 0 && (
                            <div className="flex items-center gap-2.5 shrink-0">
                                {redes.map((r) => (
                                    <a
                                        key={r.label}
                                        href={r.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={r.label}
                                        className="text-white/80 hover:text-white transition-colors"
                                    >
                                        <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d={r.d} />
                                        </svg>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-surface dark:bg-surface-dark-2 border-b border-border/60 dark:border-white/[0.06]">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="h-16 flex items-center gap-3">
                        {/* Sucursal: en una tienda con varios locales, saber en cuál se está
                            comprando es parte de la identidad de la página, no un ajuste. */}
                        <div className="flex-1 min-w-0">
                            {canChangeBranch && branch && (
                                <button
                                    type="button"
                                    onClick={onChangeBranch}
                                    className="inline-flex items-center gap-1.5 max-w-full text-[11px] font-bold text-content-muted hover:text-brand-500 transition-colors"
                                >
                                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    <span className="truncate">{branch.name}</span>
                                </button>
                            )}
                        </div>

                        {/* El logo es la forma esperada de "volver al inicio" en cualquier
                            tienda: limpia búsqueda y categoría, y si había una ficha de
                            producto abierta, la cierra — lo mismo que hace la miga "Tienda"
                            de esa página. Antes no tenía ningún comportamiento. */}
                        {/* El tope de ancho deja sitio a los iconos de la derecha en un
                            teléfono estrecho: un logo apaisado a esta altura puede pasar de 200px. */}
                        <button type="button" onClick={onGoHome} className="shrink-0 max-w-[48vw] md:max-w-none">
                            {store?.logo_url ? (
                                <StoreLogo store={store} className="h-11 md:h-12 w-auto max-w-full" />
                            ) : (
                                <span className="text-[15px] md:text-[18px] font-bold text-content dark:text-white tracking-tight">
                                    {store?.name}
                                </span>
                            )}
                        </button>

                        <div className="flex-1 flex items-center justify-end gap-0.5">
                            <IconBtn onClick={() => setSearchOpen(v => !v)} label="Buscar">
                                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </IconBtn>

                            <IconBtn onClick={identity ? onOpenProfile : undefined} label="Mi cuenta" badge={openOrdersCount}>
                                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            </IconBtn>

                            {ordersEnabled && (
                                <button
                                    type="button"
                                    onClick={onOpenCart}
                                    className="ml-1 h-9 pl-2.5 pr-3 rounded-full flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors active:scale-95"
                                >
                                    <span className="relative">
                                        <svg className="w-[18px] h-[18px] text-content dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17M17 17a2 2 0 100 4 2 2 0 000-4zM9 19a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                        {cartCount > 0 && (
                                            <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-brand-500 text-white text-[9px] font-semibold flex items-center justify-center tabular-nums">
                                                {cartCount}
                                            </span>
                                        )}
                                    </span>
                                    <span className="hidden sm:block text-[13px] font-semibold text-content dark:text-white tabular-nums">
                                        {fmt(cartTotal, baseCur)}
                                    </span>
                                </button>
                            )}

                            <IconBtn onClick={toggle} label={dark ? "Modo claro" : "Modo oscuro"}>
                                {dark
                                    ? <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                    : <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
                            </IconBtn>
                        </div>
                    </div>

                    {searchOpen && (
                        <div className="pb-3 animate-in fade-in slide-in-from-top-1 duration-200">
                            <input
                                autoFocus
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="¿Qué estás buscando?"
                                className="w-full h-11 px-4 rounded-full bg-surface-2 dark:bg-white/5 border border-border/60 dark:border-white/10 text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle outline-none focus:border-brand-500/50"
                            />
                        </div>
                    )}
                </div>

                {entradas.length > 0 && (
                    <MenuCategorias
                        entradas={entradas} categories={categories}
                        category={category} setCategory={setCategory}
                    />
                )}
            </div>
        </header>
    );
}
