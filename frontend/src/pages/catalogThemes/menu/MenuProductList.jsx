import { useEffect, useRef } from "react";
import { resolveImageUrl, imgRetryOnError } from "../../../helpers";
import { isIntegerUnit } from "../../../helpers/unitFormatter";

// Solo el número, sin el nombre de la unidad: dentro del botón redondo de agregar (40px)
// "3 UNIDADES" no cabe en una línea y se parte en dos, ilegible. La unidad ya se explica en
// el nombre del producto y en el paso a paso del modal — aquí solo hace falta la cantidad.
const soloNumero = (qty, unit) => isIntegerUnit(unit)
    ? Math.round(parseFloat(qty) || 0).toLocaleString("es-VE")
    : (parseFloat(qty) || 0).toLocaleString("es-VE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

// Panel "papel sobre la mesa": todo lo de la categoría activa —foto grande, pestañas para
// cambiar sin volver a los mosaicos, lista de platos— vive dentro de UN panel claro, y no
// suelto sobre el fondo oscuro de la página. Es lo que hace que se lea como una carta que se
// abre encima de la mesa, no como una lista más de la web.
//
// El color del panel lo elige la tienda (Ajustes → Vitrina → "Color del panel del menú");
// aquí solo se aplica. Todo el texto de adentro usa colores FIJOS —neutral-XXX, nunca
// text-content-muted/-subtle— porque esas dos cambian de valor con el modo claro/oscuro del
// SISTEMA, y este panel es del color que la tienda eligió, no del que traiga el visitante.
const PANEL_POR_DEFECTO = "#F4FAF6";

function Row({ p, inCart, fmt, baseCur, altCur, canOrder, onOpenAdd }) {
    const price = parseFloat(p.price);
    const hasPrice = price > 0;
    const enOferta = hasPrice && p.price_before != null;

    return (
        <li className={`flex items-center gap-3 py-3.5 ${!p.available ? "opacity-50" : ""}`}>
            <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-black/5 relative">
                {p.image_url ? (
                    <img
                        src={resolveImageUrl(p.image_url)}
                        alt=""
                        loading="lazy"
                        onError={imgRetryOnError}
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-brand-500/50">
                        {p.name.charAt(0)}
                    </div>
                )}
            </div>

            <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-black uppercase tracking-tight text-neutral-900 leading-snug line-clamp-2">
                    {p.name}
                </h3>
                {p.short_description && (
                    <p className="text-[11px] font-medium text-neutral-500 leading-snug line-clamp-1 mt-0.5">
                        {p.short_description}
                    </p>
                )}
                <div className="flex items-baseline gap-2 mt-1">
                    {hasPrice ? (
                        <>
                            <span className="text-[15px] font-black text-neutral-900 tabular-nums">{fmt(p.price, baseCur)}</span>
                            {enOferta && (
                                <span className="text-[11px] font-bold text-neutral-400 line-through tabular-nums">{fmt(p.price_before, baseCur)}</span>
                            )}
                            {altCur && (
                                <span className="text-[10px] font-medium text-neutral-400 tabular-nums">{fmt(p.price, altCur)}</span>
                            )}
                        </>
                    ) : (
                        <span className="text-[11px] font-bold text-neutral-400">Consultar precio</span>
                    )}
                    {!p.available && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-danger">Agotado</span>
                    )}
                </div>
            </div>

            {/* Siempre abre la ficha de personalizar (ver ProductAddModal), incluso ya
                estando en el carrito: en un menú, "sin cebolla" o "bien cocido" son pedidos
                tan comunes que ofrecer la nota en el mismo gesto de agregar vale más que
                ahorrarse un modal a quien no la necesita. */}
            {canOrder && (
                <button
                    onClick={() => onOpenAdd(p)}
                    disabled={!p.available || !hasPrice}
                    aria-label={`Agregar ${p.name}`}
                    className={[
                        "relative shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90",
                        !p.available || !hasPrice
                            ? "bg-black/5 text-black/20 cursor-not-allowed"
                            : inCart
                                ? "bg-brand-500/15 text-brand-500 border border-brand-500/40"
                                : "bg-brand-500 text-white hover:brightness-110",
                    ].join(" ")}
                >
                    {inCart ? (
                        <span className="text-[13px] font-black tabular-nums">{soloNumero(inCart.qty, p.unit)}</span>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    )}
                    {inCart?.note && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white border border-black/10 flex items-center justify-center" title="Con nota">
                            <svg className="w-2 h-2 text-brand-500" fill="currentColor" viewBox="0 0 24 24"><path d="M4 4h16v12H5.17L4 17.17V4z" /></svg>
                        </span>
                    )}
                </button>
            )}
        </li>
    );
}

export default function MenuProductList({
    category, categories, onSwitchCategory, panelColor,
    products, total, loading, loadingMore, loadMore,
    cart, fmt, baseCur, altCur, ordersEnabled, onOpenAdd,
}) {
    const sentinelRef = useRef(null);
    const hayMas = products.length < total;

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !hayMas || loadingMore || loading) return;
        const io = new IntersectionObserver(
            entries => { if (entries[0].isIntersecting) loadMore(); },
            { rootMargin: "400px" }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [hayMas, loadingMore, loading, loadMore]);

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <div
                className="rounded-3xl overflow-hidden shadow-xl shadow-black/20"
                style={{ backgroundColor: panelColor || PANEL_POR_DEFECTO }}
            >
                {category?.image_url ? (
                    <div className="aspect-[16/7] relative">
                        <img
                            src={resolveImageUrl(category.image_url)}
                            alt=""
                            onError={imgRetryOnError}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                        <div className="absolute bottom-4 left-5 right-5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Categoría activa</span>
                            <h2 className="text-[26px] sm:text-[30px] font-black uppercase text-white leading-none mt-0.5">
                                {category.name}
                            </h2>
                            {category.short_description && (
                                <p className="text-[12px] font-bold uppercase tracking-wide text-white/85 mt-1">
                                    {category.short_description}
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    // Sin foto de categoría, el mismo encabezado pero en texto plano dentro
                    // del panel: no hay imagen sobre la que apoyar el letrero blanco.
                    <div className="px-5 pt-5 pb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-500">Categoría activa</span>
                        <h2 className="text-[24px] font-black uppercase text-neutral-900 leading-none mt-0.5">
                            {category?.name || "Productos"}
                        </h2>
                        {category?.short_description && (
                            <p className="text-[12px] font-bold text-neutral-500 mt-1">{category.short_description}</p>
                        )}
                    </div>
                )}

                {/* Pestañas de TODAS las categorías: cambiar de plato no debería obligar a
                    volver a los mosaicos y elegir de nuevo. */}
                {categories?.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-3 border-b border-black/[0.06]">
                        {categories.map((c) => {
                            const activa = String(c.id) === String(category?.id);
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => onSwitchCategory(String(c.id))}
                                    className={`shrink-0 h-8 px-3.5 rounded-full text-[11px] font-black uppercase tracking-wide transition-colors ${activa
                                        ? "bg-brand-500 text-white"
                                        : "bg-black/[0.05] text-neutral-600 hover:bg-black/[0.08]"}`}
                                >
                                    {c.name}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="px-4">
                    {loading ? (
                        <ul className="divide-y divide-black/[0.06]">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <li key={i} className="flex items-center gap-3 py-3.5">
                                    <div className="w-16 h-16 rounded-xl bg-black/[0.05] animate-pulse shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-2/3 rounded-full bg-black/[0.05] animate-pulse" />
                                        <div className="h-3 w-1/3 rounded-full bg-black/[0.05] animate-pulse" />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : products.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-[13px] font-bold text-neutral-700">No hay productos publicados aquí</p>
                        </div>
                    ) : (
                        <>
                            <ul className="divide-y divide-black/[0.06]">
                                {products.map((p) => (
                                    <Row
                                        key={p.id}
                                        p={p}
                                        inCart={cart.find(it => it.id === p.id)}
                                        fmt={fmt} baseCur={baseCur} altCur={altCur}
                                        canOrder={ordersEnabled}
                                        onOpenAdd={onOpenAdd}
                                    />
                                ))}
                            </ul>
                            <div ref={sentinelRef} className="h-4" />
                            {loadingMore && (
                                <div className="pb-4 text-center text-[11px] font-bold uppercase tracking-widest text-neutral-400 animate-pulse">
                                    Cargando más
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="h-2" />
            </div>
        </div>
    );
}
