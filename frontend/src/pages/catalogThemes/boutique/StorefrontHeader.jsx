import { useState } from "react";
import { resolveImageUrl } from "../../../helpers";
import { getSocialLinks } from "./socialLinks";

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
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-black flex items-center justify-center tabular-nums">
                {badge}
            </span>
        )}
    </button>
);

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
                                    <a href={store.announcement.link} className="text-[11px] font-bold hover:underline truncate inline-block max-w-full align-middle">
                                        {store.announcement.text}
                                    </a>
                                ) : (
                                    <span className="text-[11px] font-bold truncate inline-block max-w-full align-middle">
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
                        <button type="button" onClick={onGoHome} className="shrink-0">
                            {store?.logo_url ? (
                                <img
                                    src={resolveImageUrl(store.logo_url)}
                                    alt={store.name}
                                    className="h-9 md:h-11 w-auto object-contain"
                                />
                            ) : (
                                <span className="text-[15px] md:text-[18px] font-black text-content dark:text-white tracking-tight">
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
                                            <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-brand-500 text-white text-[9px] font-black flex items-center justify-center tabular-nums">
                                                {cartCount}
                                            </span>
                                        )}
                                    </span>
                                    <span className="hidden sm:block text-[12px] font-black text-content dark:text-white tabular-nums">
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
                    <nav className="border-t border-border/40 dark:border-white/[0.04]">
                        {/* Desplazable en horizontal: en un teléfono no caben cinco categorías
                            con sus etiquetas, y partirlas en dos filas descoloca la cabecera. */}
                        <div className="max-w-6xl mx-auto px-4 flex items-center gap-1 overflow-x-auto scrollbar-hide">
                            <button
                                type="button"
                                onClick={() => setCategory("")}
                                className={`shrink-0 h-11 px-3 text-[12px] font-black uppercase tracking-wide transition-colors border-b-2 ${!category
                                    ? "text-brand-500 border-brand-500"
                                    : "text-content-muted border-transparent hover:text-content dark:hover:text-white"}`}
                            >
                                Todo
                            </button>
                            {entradas.map((e) => (
                                <button
                                    key={e.category_id}
                                    type="button"
                                    onClick={() => setCategory(String(e.category_id))}
                                    className={`relative shrink-0 h-11 px-3 text-[12px] font-black uppercase tracking-wide transition-colors border-b-2 ${String(category) === String(e.category_id)
                                        ? "text-brand-500 border-brand-500"
                                        : "text-content-muted border-transparent hover:text-content dark:hover:text-white"}`}
                                >
                                    {e.label}
                                    {e.badge && (
                                        <span className="absolute -top-0.5 right-0 px-1.5 py-px rounded-full bg-brand-500 text-white text-[8px] font-black uppercase tracking-wider whitespace-nowrap">
                                            {e.badge}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </nav>
                )}
            </div>
        </header>
    );
}
