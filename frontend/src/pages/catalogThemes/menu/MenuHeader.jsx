import { resolveImageUrl } from "../../../helpers";

// Cabecera del tema de menú: mucho más simple que la de boutique, porque aquí la navegación
// no vive en la cabecera —vive en los mosaicos de categoría—. No hay buscador ni barra de
// categorías: entrar a un plato es entrar a su mosaico, no filtrar una lista.
//
// "Atrás" solo aparece dentro de una categoría, para volver a los mosaicos. En la portada no
// hay a dónde volver.
// Mismo tono que usa el fondo de página por defecto (ver DEFAULT_BG en CatalogLayout): sin
// color propio configurado, la cabecera y la página tienen que verse como una sola pieza, no
// como dos negros ligeramente distintos.
const DEFAULT_BG = "#0A0A0A";

export default function MenuHeader({
    store, showBack, onBack,
    cartCount, cartTotal, fmt, baseCur, onOpenCart, ordersEnabled,
    identity, openOrdersCount, onOpenProfile, onLogout,
    branch, canChangeBranch, onChangeBranch,
    bgColor,
}) {
    return (
        <header
            className="sticky top-0 z-30 border-b border-white/[0.06]"
            style={{ backgroundColor: bgColor || DEFAULT_BG }}
        >
            <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                    {showBack ? (
                        <button
                            type="button"
                            onClick={onBack}
                            className="inline-flex items-center gap-1.5 h-9 px-3 -ml-3 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            <span className="text-[12px] font-black uppercase tracking-widest">Atrás</span>
                        </button>
                    ) : (
                        // Cambiar de sucursal solo se puede pedir desde los mosaicos, no
                        // dentro de una categoría — ahí ese espacio ya lo ocupa "Atrás".
                        canChangeBranch && branch && (
                            <button
                                type="button"
                                onClick={onChangeBranch}
                                className="inline-flex items-center gap-1.5 max-w-full h-9 px-3 -ml-3 rounded-full text-[11px] font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                <span className="truncate">{branch.name}</span>
                            </button>
                        )
                    )}
                </div>

                <div className="shrink-0 flex flex-col items-center">
                    {store?.logo_url ? (
                        <img src={resolveImageUrl(store.logo_url)} alt={store.name} className="h-9 w-auto object-contain" />
                    ) : (
                        <span className="text-[16px] font-black text-white tracking-tight">{store?.name}</span>
                    )}
                    {store?.slogan && (
                        <span className="hidden sm:block text-[9px] font-bold uppercase tracking-widest text-white/50 mt-0.5">
                            {store.slogan}
                        </span>
                    )}
                </div>

                <div className="flex-1 flex items-center justify-end gap-1.5">
                    {identity && (
                        <button
                            type="button"
                            onClick={onOpenProfile}
                            aria-label="Mi cuenta"
                            className="relative w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            {openOrdersCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-brand-500 text-white text-[9px] font-black flex items-center justify-center tabular-nums">
                                    {openOrdersCount}
                                </span>
                            )}
                        </button>
                    )}

                    {/* Directo desde la cabecera y no solo dentro de la ficha de perfil: en
                        una tablet compartida en la mesa, el cliente que termina necesita
                        salir en un toque, sin que el siguiente vea su pedido o sus datos un
                        segundo de más. onLogout ya trae su propia confirmación (LogoutConfirm)
                        cuando hay algo en el carrito, así que un toque accidental no pierde
                        nada sin avisar. */}
                    {identity && onLogout && (
                        <button
                            type="button"
                            onClick={onLogout}
                            aria-label="Cerrar sesión"
                            title="Cerrar sesión"
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        </button>
                    )}

                    {ordersEnabled && (
                        <button
                            type="button"
                            onClick={onOpenCart}
                            className="h-10 pl-3 pr-3.5 rounded-full bg-brand-500 text-white flex items-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all"
                        >
                            <span className="relative">
                                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17M17 17a2 2 0 100 4 2 2 0 000-4zM9 19a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                {cartCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-white text-brand-500 text-[9px] font-black flex items-center justify-center tabular-nums">
                                        {cartCount}
                                    </span>
                                )}
                            </span>
                            {cartCount > 0 && (
                                <span className="hidden sm:block text-[12px] font-black tabular-nums">{fmt(cartTotal, baseCur)}</span>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}
