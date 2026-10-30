import { useEffect, useRef, useState } from "react";
import { getSocialLinks } from "./socialLinks";
import StoreLogo from "./StoreLogo";
import GlidingTabs from "./GlidingTabs";
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

// Iconos de la cabecera, dibujados para esta tienda y no los genéricos de librería: trazo fino
// y redondeado, y cada uno con su gesto al pasar el cursor (la lupa se inclina, el sol gira y
// se vuelve luna). El botón es un círculo que se tiñe; el icono es lo que se mueve.
const IconBtn = ({ onClick, label, badge, children, className = "" }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`group/ico relative w-10 h-10 rounded-full flex items-center justify-center text-content dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/10 transition-colors active:scale-90 ${className}`}
    >
        {children}
        {badge > 0 && (
            <span key={badge} className="badge-pop absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums ring-2 ring-surface dark:ring-surface-dark-2">
                {badge}
            </span>
        )}
    </button>
);

const ICO = "w-[21px] h-[21px] transition-transform duration-300 ease-[cubic-bezier(0.34,1.5,0.5,1)]";

const IconoBuscar = () => (
    <svg className={`${ICO} group-hover/ico:-rotate-12 group-hover/ico:scale-110`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
        <circle cx="10.5" cy="10.5" r="6.25" />
        <path d="M15.2 15.2L20 20" strokeWidth={2.2} />
        <path d="M7.6 9.2a3.2 3.2 0 012.2-1.9" opacity=".55" />
    </svg>
);

const IconoCuenta = () => (
    <svg className={`${ICO} group-hover/ico:-translate-y-0.5`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
        <circle cx="12" cy="8.2" r="3.7" />
        <path d="M4.8 19.6c1.2-3.4 4-5.2 7.2-5.2s6 1.8 7.2 5.2" />
    </svg>
);

// Sol y luna son el MISMO dibujo: un círculo que crece y al que una sombra le muerde un lado
// (luna), o que se encoge, suelta la sombra y abre los rayos (sol). Con transformaciones y no
// con `r`/`cx`, que Safari no anima.
function IconoTema({ dark }) {
    const T = "transition-transform duration-500 ease-[cubic-bezier(0.34,1.3,0.5,1)] motion-reduce:transition-none";
    return (
        <svg className={`w-[21px] h-[21px] ${T} ${dark ? "rotate-0" : "-rotate-90"} group-hover/ico:rotate-[20deg]`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
            <mask id="tema-mordida">
                <rect x="0" y="0" width="24" height="24" fill="#fff" />
                <circle cx="18.5" cy="5.5" r="6.5" fill="#000" className={T} style={{ transform: dark ? "translate(9px,-9px)" : "none" }} />
            </mask>
            <circle cx="12" cy="12" r="8.6" fill="currentColor" stroke="none" mask="url(#tema-mordida)"
                className={T} style={{ transformBox: "fill-box", transformOrigin: "center", transform: dark ? "scale(.5)" : "none" }} />
            <g className={T} style={{ transformBox: "view-box", transformOrigin: "12px 12px", transform: dark ? "none" : "scale(0) rotate(-45deg)" }}>
                {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                    <path key={a} d="M12 2.6v1.9" transform={`rotate(${a} 12 12)`} />
                ))}
            </g>
        </svg>
    );
}

// Con la cédula ya dada, "Mi cuenta" deja de ser un muñeco gris: lleva la inicial del cliente
// en el color de la tienda. Es la señal más clara de "ya estás dentro".
const iniciales = (nombre) => String(nombre || "").trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase();

function Avatar({ nombre }) {
    return (
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-white bg-brand-500 ring-2 ring-brand-500/20 transition-transform duration-300 ease-[cubic-bezier(0.34,1.5,0.5,1)] group-hover/ico:scale-110"
            style={{ backgroundImage: "linear-gradient(135deg, rgb(255 255 255 / .22), rgb(255 255 255 / 0) 60%)" }}>
            {iniciales(nombre) || <IconoCuenta />}
        </span>
    );
}

// La barra de categorías: cada una con su foto en miniatura, sobre las pestañas con píldora
// deslizante (GlidingTabs).
function MenuCategorias({ entradas, categories, category, setCategory }) {
    const fotoDe = (id) => categories.find((c) => c.id === id)?.image_url || null;
    const items = [
        {
            key: "", label: "Todo",
            leading: (
                <span className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-300 ${!category ? "bg-brand-500 text-white" : "bg-surface-2 dark:bg-white/[0.06]"}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <rect x="4" y="4" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="3.25" />
                        <rect x="4" y="13.5" width="6.5" height="6.5" rx="3.25" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
                    </svg>
                </span>
            ),
        },
        ...entradas.map((e) => {
            const foto = fotoDe(e.category_id);
            const sel = String(category) === String(e.category_id);
            return {
                key: String(e.category_id), label: toNameCase(e.label), badge: e.badge,
                leading: foto ? (
                    <img src={resolveImageUrl(foto)} alt="" loading="lazy" onError={imgRetryOnError}
                        className={`w-7 h-7 rounded-full object-cover ring-2 transition-[box-shadow,transform] duration-300 ${sel ? "ring-brand-500 scale-105" : "ring-transparent"}`} />
                ) : null,
            };
        }),
    ];

    return (
        <nav className="border-t border-border/40 dark:border-white/[0.04]">
            <GlidingTabs items={items} value={category} onChange={setCategory} className="max-w-6xl mx-auto px-4 py-2" />
        </nav>
    );
}

// Buscador integrado. Mientras está vacío, el texto de ayuda va cambiando solo entre las
// categorías de la tienda ("Buscar Milagros", "Buscar Poción Kids"...): enseña qué hay sin
// ocupar más espacio. En escritorio, la tecla / lo enfoca, como en las tiendas grandes.
function Buscador({ search, setSearch, categories, autoFocus = false, onEscape = null, className = "" }) {
    const ref = useRef(null);
    const [foco, setFoco] = useState(false);
    const [n, setN] = useState(0);
    const ideas = ["productos", ...categories.slice(0, 8).map((c) => toNameCase(c.name))];

    useEffect(() => {
        if (search || foco || ideas.length < 2) return;
        const t = setInterval(() => setN((k) => (k + 1) % ideas.length), 2600);
        return () => clearInterval(t);
    }, [search, foco, ideas.length]);

    useEffect(() => {
        if (autoFocus) return;
        const tecla = (e) => {
            if (e.key !== "/" || /^(input|textarea|select)$/i.test(document.activeElement?.tagName || "")) return;
            if (!ref.current || ref.current.offsetParent === null) return;
            e.preventDefault();
            ref.current.focus();
        };
        window.addEventListener("keydown", tecla);
        return () => window.removeEventListener("keydown", tecla);
    }, [autoFocus]);

    return (
        <div className={`relative ${className}`}>
            <svg className={`absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none transition-colors ${foco ? "text-brand-500" : "text-content-subtle"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                <circle cx="10.5" cy="10.5" r="6.25" /><path d="M15.2 15.2L20 20" />
            </svg>
            <input
                ref={ref}
                autoFocus={autoFocus}
                type="search"
                autoComplete="off"
                aria-label="Buscar productos"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setFoco(true)}
                onBlur={() => setFoco(false)}
                onKeyDown={(e) => { if (e.key === "Escape") { setSearch(""); e.currentTarget.blur(); onEscape?.(); } }}
                className="w-full h-11 pl-11 pr-12 rounded-full bg-surface-2 dark:bg-white/[0.06] border border-transparent text-[14px] font-medium text-content dark:text-white outline-none focus:bg-white dark:focus:bg-white/[0.08] focus:border-brand-500/50 focus:ring-4 focus:ring-brand-500/10 transition-[background-color,border-color,box-shadow] duration-200 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {!search && (
                <span aria-hidden="true" className="pointer-events-none absolute left-11 right-12 top-1/2 -translate-y-1/2 overflow-hidden whitespace-nowrap text-[14px] text-content-subtle">
                    Buscar <span key={n} className="search-word font-medium text-content-muted">{ideas[n % ideas.length]}</span>
                </span>
            )}
            {search ? (
                // Centrada con inset-y-0 + my-auto y no con -translate-y-1/2: la animación de
                // entrada (stepper-in) usa transform y pisaba la traslación, la X caía abajo.
                <button type="button" onClick={() => { setSearch(""); ref.current?.focus(); }} aria-label="Borrar búsqueda"
                    className="stepper-in absolute right-1.5 inset-y-0 my-auto w-8 h-8 rounded-full flex items-center justify-center text-content-muted hover:bg-black/[0.06] dark:hover:bg-white/10 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
            ) : !autoFocus && (
                <kbd className={`hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md items-center justify-center text-[12px] font-sans font-medium text-content-subtle ring-1 ring-inset ring-border dark:ring-white/15 transition-opacity ${foco ? "opacity-0" : ""}`}>/</kbd>
            )}
        </div>
    );
}

const IconoSede = ({ className = "w-4 h-4" }) => (
    <svg className={`${className} shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.6,0.5,1)] group-hover/sede:-translate-y-0.5`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0113 0c0 5.2-6.5 11-6.5 11z" />
        <circle cx="12" cy="10" r="2.3" />
    </svg>
);

// La sede donde se compra, como un chip que se lee y se toca: "Comprando en · Principal" con
// la flecha de que se puede cambiar. Antes era un texto gris de 11px suelto en la esquina.
function Sede({ branch, onClick, className = "" }) {
    return (
        <button type="button" onClick={onClick} title="Cambiar de sede"
            className={`group/sede h-10 pl-1.5 pr-3 rounded-full items-center gap-2 ring-1 ring-inset ring-border dark:ring-white/10 hover:ring-brand-500/40 hover:bg-brand-500/[0.04] active:scale-95 transition-[box-shadow,background-color,transform] ${className}`}>
            <span className="w-7 h-7 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                <IconoSede />
            </span>
            <span className="text-left leading-tight min-w-0">
                <span className="block text-[10.5px] text-content-subtle">Comprando en</span>
                <span className="block text-[13px] font-semibold text-content dark:text-white truncate max-w-[130px]">{toNameCase(branch.name)}</span>
            </span>
            <svg className="w-3.5 h-3.5 text-content-subtle transition-transform duration-300 group-hover/sede:translate-y-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
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
                    {/* Logo a la izquierda, buscador en el centro, cliente a la derecha: la forma
                        en que cualquiera espera una tienda. Antes el logo iba centrado con la
                        mitad izquierda vacía, y el buscador era un icono que desplegaba una barra
                        a todo el ancho debajo: buscar, que es lo primero que hace quien sabe qué
                        quiere, costaba un toque extra y empujaba la página. */}
                    <div className="h-16 md:h-[72px] flex items-center gap-3 md:gap-6">
                        {/* El logo es la forma esperada de "volver al inicio": limpia búsqueda y
                            categoría, y cierra la ficha de producto si había una abierta. */}
                        <button type="button" onClick={onGoHome} className="shrink-0 max-w-[46vw] md:max-w-[220px] transition-transform active:scale-95">
                            {store?.logo_url ? (
                                <StoreLogo store={store} className="h-10 md:h-12 w-auto max-w-full" />
                            ) : (
                                <span className="font-display text-[17px] md:text-[20px] font-bold text-content dark:text-white tracking-tight">
                                    {store?.name}
                                </span>
                            )}
                        </button>

                        <Buscador
                            search={search} setSearch={setSearch} categories={categories}
                            className="hidden md:block flex-1 max-w-[560px] mx-auto"
                        />

                        <div className="ml-auto md:ml-0 flex items-center gap-1">
                            {canChangeBranch && branch && (
                                <Sede branch={branch} onClick={onChangeBranch} className="hidden lg:flex mr-1" />
                            )}

                            <IconBtn onClick={() => setSearchOpen(v => !v)} label={searchOpen ? "Cerrar búsqueda" : "Buscar"} className="md:hidden">
                                {searchOpen ? (
                                    <svg className="w-[19px] h-[19px] stepper-in" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                                ) : <IconoBuscar />}
                            </IconBtn>

                            <IconBtn onClick={identity ? onOpenProfile : undefined} label="Mi cuenta" badge={openOrdersCount}>
                                {identity?.name ? <Avatar nombre={identity.name} /> : <IconoCuenta />}
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
                                <IconoTema dark={dark} />
                            </IconBtn>
                        </div>
                    </div>

                    {/* En el teléfono el buscador se despliega bajo la cabecera al tocar la lupa. */}
                    {searchOpen && (
                        <div className="md:hidden pb-3 expand-in">
                            <Buscador search={search} setSearch={setSearch} categories={categories} autoFocus
                                onEscape={() => setSearchOpen(false)} />
                        </div>
                    )}

                    {/* Sede en pantallas sin sitio para el chip: una línea fina, siempre a la vista. */}
                    {canChangeBranch && branch && (
                        <div className="lg:hidden -mt-1 pb-2">
                            <button type="button" onClick={onChangeBranch}
                                className="group/sede inline-flex items-center gap-1.5 max-w-full text-[12px] text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                                <IconoSede className="w-3.5 h-3.5 text-brand-500" />
                                <span className="truncate">Comprando en <span className="font-semibold text-content dark:text-white">{toNameCase(branch.name)}</span></span>
                                <span className="text-brand-600 dark:text-brand-400 font-medium">· Cambiar</span>
                            </button>
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
