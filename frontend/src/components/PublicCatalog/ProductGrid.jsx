import { resolveImageUrl, imgRetryOnError } from "../../helpers";
import { fmtQtyUnit } from "../../helpers/unitFormatter";

// Rejilla de productos del catálogo público.
//
// Esta pantalla la ven clientes finales, no cajeros, así que se aparta a propósito de la
// densidad del ERP: fichas con aire, foto sobre fondo neutro y una sola acción por tarjeta.
// La escala tipográfica y los radios siguen el patrón de ProductModal —el "estilo iOS" de la
// casa— pero sin mayúsculas en los nombres de producto: en una vitrina se leen peor y hacen
// que todo pese lo mismo.
//
// Las animaciones son de refuerzo, no decorativas: la tarjeta responde al toque, el producto
// que ya está en el pedido se distingue solo, y las fichas nuevas aparecen escalonadas al
// cargar más para que se vea de dónde salieron.

function ProductCard({ p, inCart, fmt, baseCur, altCur, canOrder, onAdd, index }) {
    const price = parseFloat(p.price);
    const hasPrice = price > 0;

    return (
        <article
            style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
            className={[
                "group relative flex flex-col overflow-hidden rounded-2xl",
                "bg-surface dark:bg-surface-dark-2",
                "border border-border/60 dark:border-white/[0.06]",
                "shadow-sm hover:shadow-lg dark:shadow-none",
                "transition-all duration-300 ease-out",
                "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards",
                // Solo se eleva donde hay cursor: en un táctil el hover se queda pegado
                // después de tocar y la tarjeta se queda flotando sin motivo.
                "[@media(hover:hover)]:hover:-translate-y-1",
                inCart ? "ring-2 ring-brand-500/40 border-brand-500/30" : "",
                !p.available ? "opacity-60" : "",
            ].join(" ")}
        >
            <div className="aspect-square bg-surface-2 dark:bg-white/[0.03] relative overflow-hidden">
                {p.image_url ? (
                    <img
                        src={resolveImageUrl(p.image_url)}
                        alt={p.name}
                        loading="lazy"
                        onError={imgRetryOnError}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out [@media(hover:hover)]:group-hover:scale-105"
                    />
                ) : (
                    // Sin foto se muestra la inicial sobre un degradado suave: repetir el mismo
                    // icono gris en decenas de tarjetas hace ver el catálogo roto, mientras que
                    // la inicial distingue una tarjeta de otra.
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-500/5 to-brand-500/[0.12]">
                        <span className="text-4xl font-black text-brand-500/25 select-none">
                            {p.name.charAt(0)}
                        </span>
                    </div>
                )}

                {!p.available && (
                    <span className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-danger/90 backdrop-blur text-white text-[9px] font-bold uppercase tracking-wide shadow-sm">
                        Agotado
                    </span>
                )}

                {/* Distintivo de "ya lo pediste": aparece con un rebote corto para que se note
                    sin tener que mirar el carrito. */}
                {inCart && (
                    <span className="absolute top-2.5 left-2.5 h-6 px-2 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-md animate-in zoom-in-50 duration-300 tabular-nums">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        {fmtQtyUnit(inCart.qty, p.unit)}
                    </span>
                )}
            </div>

            <div className="p-3.5 flex flex-col gap-1 flex-1">
                {p.category_name && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-brand-500/80 truncate">
                        {p.category_name}
                    </span>
                )}

                {/* Sin uppercase: es el nombre que el cliente lee para decidir, y en mayúsculas
                    compite con el precio en vez de acompañarlo. */}
                <h2 className="text-[13px] font-bold text-content dark:text-white leading-snug line-clamp-2">
                    {p.name}
                </h2>

                <div className="mt-auto pt-2">
                    {/* Un producto sin precio cargado mostraba "Ref.0,00", que en una vitrina se
                        lee como que es gratis. Mejor invitar a preguntar. */}
                    {hasPrice ? (
                        <>
                            <div className="text-[17px] font-black text-content dark:text-white tabular-nums leading-none">
                                {fmt(p.price, baseCur)}
                            </div>
                            {altCur && (
                                <div className="text-[11px] font-bold text-content-muted tabular-nums mt-0.5">
                                    {fmt(p.price, altCur)}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-[11px] font-bold text-content-muted">
                            Consultar precio
                        </div>
                    )}
                </div>

                {/* Un producto agotado o sin precio no puede entrar al pedido: pedirlo solo
                    genera un mensaje que la tienda tendrá que rechazar. */}
                {canOrder && p.available && hasPrice && (
                    <button
                        onClick={() => onAdd(p)}
                        className={[
                            "mt-2.5 h-10 rounded-full text-[11px] font-bold tracking-wide",
                            "flex items-center justify-center gap-1.5",
                            "transition-all duration-200 active:scale-[0.97]",
                            inCart
                                ? "bg-brand-500/10 text-brand-500 border border-brand-500/25 hover:bg-brand-500/15"
                                : "bg-brand-500 text-white shadow-sm shadow-brand-500/25 hover:brightness-110 hover:shadow-md",
                        ].join(" ")}
                    >
                        {inCart ? (
                            <>Agregar otro</>
                        ) : (
                            <>
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                Agregar
                            </>
                        )}
                    </button>
                )}
            </div>
        </article>
    );
}

export default function ProductGrid({
    products, total, loading, loadingMore, loadMore,
    cart, fmt, baseCur, altCur, ordersEnabled, onAdd,
}) {
    if (loading) {
        // Esqueleto en vez de la palabra "Cargando...": mantiene la forma de la rejilla, así
        // que el catálogo no da un salto cuando llegan los productos.
        return (
            <main className="max-w-5xl mx-auto px-4 py-6">
                <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="rounded-2xl border border-border/60 dark:border-white/[0.06] overflow-hidden bg-surface dark:bg-surface-dark-2">
                            <div className="aspect-square bg-surface-2 dark:bg-white/[0.03] animate-pulse" />
                            <div className="p-3.5 space-y-2">
                                <div className="h-2.5 w-1/3 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                                <div className="h-3 w-3/4 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                                <div className="h-4 w-1/2 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        );
    }

    if (products.length === 0) {
        return (
            <main className="max-w-5xl mx-auto px-4 py-6">
                <div className="py-24 flex flex-col items-center gap-3 text-center animate-in fade-in duration-300">
                    <div className="w-16 h-16 rounded-3xl bg-surface-2 dark:bg-white/5 flex items-center justify-center text-content-subtle">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <p className="text-[13px] font-bold text-content dark:text-white">No encontramos productos</p>
                    <p className="text-[11px] font-medium text-content-muted">Prueba con otra búsqueda o categoría.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="max-w-5xl mx-auto px-4 py-6">
            <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 sm:gap-4">
                {products.map((p, i) => (
                    <ProductCard
                        key={p.id}
                        p={p}
                        index={i}
                        inCart={cart.find(it => it.id === p.id)}
                        fmt={fmt}
                        baseCur={baseCur}
                        altCur={altCur}
                        canOrder={ordersEnabled}
                        onAdd={onAdd}
                    />
                ))}
            </div>

            {products.length < total && (
                <div className="pt-8 text-center">
                    <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="h-11 px-7 rounded-full bg-surface dark:bg-surface-dark-2 border border-border dark:border-white/10 text-[11px] font-bold text-content dark:text-white shadow-sm hover:shadow-md hover:border-brand-500/40 hover:text-brand-500 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {loadingMore ? "Cargando..." : `Ver más (${total - products.length})`}
                    </button>
                </div>
            )}
        </main>
    );
}
