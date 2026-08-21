import { resolveImageUrl, imgRetryOnError } from "../../helpers";
import CatOption from "./CatOption";

// Cabecera de la tienda: identidad, accesos del cliente y la búsqueda.
//
// La identidad manda —es lo primero que ve quien abre el enlace— así que el logo y el nombre
// llevan el peso visual. La tasa de cambio se quitó de aquí: era un dato de operación interna
// compitiendo con la marca, y el cliente ya ve ambas monedas en cada producto y en el total
// del pedido, que es donde le sirve.
export default function StoreHeader({
    store, identity, dark, toggle,
    openOrdersCount, onOpenMyOrders, onOpenProfile,
    search, setSearch,
    categories, category, setCategory,
    showCats, setShowCats,
    branch, canChangeBranch, onChangeBranch, onLogout,
}) {
    return (
        <header className="bg-surface dark:bg-surface-dark-2 border-b border-border dark:border-white/5 sticky top-0 z-20">
            {/* En móvil la identidad va en su propia fila. Compartiéndola con los tres botones
                quedaban ~130px para el nombre y se cortaba en "MI TIEND…", que es justo lo que
                no puede pasar en la pantalla que identifica a la tienda. */}
            <div className="max-w-5xl mx-auto px-4 pt-4 pb-3 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    {store?.logo_url ? (
                        <img
                            src={resolveImageUrl(store.logo_url)}
                            alt={store.name}
                            onError={imgRetryOnError}
                            // object-contain y no cover: casi todos los logos de tienda son una
                            // marca con texto, y recortarla al cuadrado se come parte del nombre.
                            className="w-16 h-16 rounded-2xl object-contain bg-white shrink-0 border border-border dark:border-white/10 shadow-sm p-1"
                        />
                    ) : (
                        // Sin logo, la inicial ocupa su lugar: deja la cabecera equilibrada en
                        // vez de que el nombre quede solo contra el borde.
                        <div className="w-16 h-16 rounded-2xl shrink-0 bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-2xl font-black text-brand-500">
                            {(store?.name || "C").charAt(0)}
                        </div>
                    )}

                    <div className="min-w-0 flex-1">
                        {/* line-clamp en vez de truncate: un nombre largo baja a una segunda
                            línea en lugar de cortarse a la mitad. */}
                        <h1 className="text-xl sm:text-2xl font-black text-content dark:text-white tracking-tight leading-tight line-clamp-2">
                            {store?.name || "Catálogo"}
                        </h1>
                        {store?.slogan && (
                            <p className="text-[12px] sm:text-[13px] font-medium text-content-muted truncate mt-0.5">
                                {store.slogan}
                            </p>
                        )}
                        {/* Con varias tiendas, cuál se está viendo tiene que estar a la vista
                            siempre: lo que aparece agotado depende de eso. Con una sola no se
                            muestra —no hay nada que distinguir— y el nombre repetiría la marca. */}
                        {branch && canChangeBranch && (
                            <button
                                onClick={onChangeBranch}
                                className="mt-1.5 h-7 pl-2 pr-2.5 rounded-full bg-brand-500/10 border border-brand-500/25 flex items-center gap-1.5 text-brand-500 hover:bg-brand-500/15 active:scale-95 transition-all max-w-full"
                                title="Cambiar de tienda"
                            >
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                <span className="text-[10px] font-black uppercase tracking-widest truncate">{branch.name}</span>
                                <svg className="w-3 h-3 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
                    {identity && (
                        <>
                            <button
                                onClick={onOpenMyOrders}
                                className="shrink-0 h-11 px-3.5 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-2 text-content-muted hover:text-brand-500 hover:border-brand-500/40 active:scale-95 transition-all"
                            >
                                <span className="relative">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                    {openOrdersCount > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-500 text-white text-[9px] font-bold flex items-center justify-center tabular-nums animate-in zoom-in-50 duration-300">
                                            {openOrdersCount}
                                        </span>
                                    )}
                                </span>
                                <span className="text-[11px] font-bold">
                                    Mis pedidos
                                </span>
                            </button>

                            <button
                                onClick={onOpenProfile}
                                className="shrink-0 h-11 px-3 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-2 text-content-muted hover:text-brand-500 hover:border-brand-500/40 active:scale-95 transition-all"
                                title="Ver mi perfil"
                            >
                                <div className="w-7 h-7 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center text-xs font-black uppercase">
                                    {(identity.name || identity.document || "U").charAt(0)}
                                </div>
                                <span className="text-[11px] font-bold max-w-[100px] truncate">
                                    {identity.name ? identity.name.split(" ")[0] : identity.document}
                                </span>
                            </button>

                            {/* Salir a la vista, no enterrado en el perfil: en un catálogo abierto
                                al público es normal que el teléfono lo use más de una persona. */}
                            <button
                                onClick={onLogout}
                                title="Cerrar sesión"
                                className="w-11 h-11 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 flex items-center justify-center text-content-muted hover:text-danger hover:border-danger/40 active:scale-95 transition-all shrink-0"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                            </button>
                        </>
                    )}
                    <button
                        onClick={toggle}
                        title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                        className="w-11 h-11 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 flex items-center justify-center text-content-muted hover:text-content dark:hover:text-white active:scale-95 transition-all shrink-0"
                    >
                        {dark ? (
                            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                        ) : (
                            <svg className="w-5 h-5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Buscador y filtro en una sola fila: la lista de categorías ocupaba un renglón
                completo aunque no se usara, y en móvil eso es alto de pantalla que se le quita
                a los productos. */}
            <div className="max-w-5xl mx-auto px-4 pb-4 flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar producto..."
                        className="w-full h-11 pl-10 pr-3 rounded-full bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[13px] font-medium text-content dark:text-white outline-none focus:border-brand-500/60 focus:bg-surface dark:focus:bg-white/[0.07] transition-all placeholder:text-content-subtle"
                    />
                </div>

                {categories.length > 0 && (
                    <div className="relative shrink-0">
                        <button
                            onClick={() => setShowCats(v => !v)}
                            className={`h-11 px-4 rounded-full border flex items-center gap-2 text-[11px] font-bold transition-all active:scale-95 ${category
                                ? "bg-brand-500 text-white border-brand-500 shadow-sm shadow-brand-500/25"
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
                                <div className="absolute right-0 top-full mt-2 w-56 max-h-72 overflow-y-auto bg-surface dark:bg-surface-dark-2 rounded-2xl border border-border dark:border-white/10 shadow-2xl z-40 p-2 space-y-0.5 animate-in fade-in slide-in-from-top-2 duration-200">
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
    );
}
