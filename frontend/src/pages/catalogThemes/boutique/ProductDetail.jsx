import { resolveImageUrl, imgRetryOnError } from "../../../helpers";
import { fmtQtyUnit } from "../../../helpers/unitFormatter";

// Página propia del producto: /catalogo/<tienda>/p/<id>. Es lo que la tienda comparte por
// WhatsApp o Instagram — el enlace de un producto suelto, no de la vitrina entera — así que
// tiene que poder verse sin haber pasado antes por la rejilla.
//
// No hay estrellas ni número de reseñas: el sistema no tiene reseñas. No hay cuotas de
// Mercado Pago: no hay pasarela. No hay selector de "Tamaño": en este sistema cada
// presentación (450ml, 900ml) es un producto distinto, con su propio precio y su propio
// stock — no una variante de uno solo. Ofrecer un selector que no cambia nada sería peor que
// no tenerlo.
export default function ProductDetail({
    p, loading, error, onBack,
    inCart, fmt, baseCur, altCur, canOrder, onAdd,
}) {
    if (loading) {
        return (
            <main className="max-w-5xl mx-auto px-4 py-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                    <div className="aspect-square rounded-2xl bg-surface-2 dark:bg-white/[0.04] animate-pulse" />
                    <div className="space-y-3 pt-2">
                        <div className="h-3 w-24 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                        <div className="h-7 w-3/4 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                        <div className="h-4 w-1/2 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                        <div className="h-9 w-1/3 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse mt-4" />
                    </div>
                </div>
            </main>
        );
    }

    if (error || !p) {
        return (
            <main className="max-w-5xl mx-auto px-4 py-20 text-center">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-surface-2 dark:bg-white/5 flex items-center justify-center text-content-subtle mb-3">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="text-[14px] font-bold text-content dark:text-white">{error || "Producto no disponible"}</p>
                <button onClick={() => onBack()} className="mt-4 text-[11px] font-bold uppercase tracking-widest text-brand-500 hover:underline">
                    Volver a la tienda
                </button>
            </main>
        );
    }

    const price = parseFloat(p.price);
    const hasPrice = price > 0;
    const enOferta = hasPrice && p.price_before != null;

    return (
        <main className="max-w-5xl mx-auto px-4 py-6 md:py-8">
            {/* Migas: sin "Inicio /" a solas, que en la referencia no lleva a ningún lado
                útil desde aquí. Con categoría se puede volver directo al filtro correcto. */}
            {/* text-content-muted (7.5:1) y no -subtle (4.8:1): la miga hay que poder leerla,
                no solo pasar el mínimo de contraste — en 11px se notaba débil. */}
            <nav className="flex items-center gap-1.5 text-[13px] font-bold text-content-muted mb-5">
                {/* onBack() y no onBack directo: como manejador de clic, React le pasa el
                    evento como primer argumento, y onBack lo toma como el id de categoría —
                    setCategory terminaba con el SyntheticEvent en vez de un id, y la
                    siguiente consulta de productos reventaba. */}
                <button onClick={() => onBack()} className="hover:text-brand-500 transition-colors">Tienda</button>
                {p.category && (
                    <>
                        <span>/</span>
                        <button onClick={() => onBack(String(p.category.id))} className="hover:text-brand-500 transition-colors">
                            {p.category.name}
                        </button>
                    </>
                )}
            </nav>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                <div className={`aspect-square rounded-2xl bg-surface-2 dark:bg-white/[0.04] border border-border/40 dark:border-white/[0.06] relative overflow-hidden ${!p.available ? "opacity-60" : ""}`}>
                    {p.image_url ? (
                        <img
                            src={resolveImageUrl(p.image_url)}
                            alt={p.name}
                            onError={imgRetryOnError}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-6xl font-black text-brand-500/25 select-none">{p.name.charAt(0)}</span>
                        </div>
                    )}
                    {!p.available && (
                        <span className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-danger/90 backdrop-blur text-white text-[11px] font-bold uppercase tracking-wide shadow-sm">
                            Agotado
                        </span>
                    )}
                </div>

                <div>
                    {p.brand && (
                        <span className="block text-[11px] font-bold uppercase tracking-wide text-content-muted">{p.brand}</span>
                    )}
                    <h1 className="mt-1 text-[24px] md:text-[28px] font-bold text-content dark:text-white leading-tight">
                        {p.name}
                    </h1>

                    {p.short_description && (
                        <p className="mt-2 text-[14px] font-medium text-content-muted">{p.short_description}</p>
                    )}

                    {p.description_paragraphs?.length > 0 && (
                        <div className="mt-4 space-y-3">
                            {p.description_paragraphs.map((par, i) => (
                                <p key={i} className="text-[13px] font-medium text-content-muted leading-relaxed">{par}</p>
                            ))}
                        </div>
                    )}

                    {p.benefits?.length > 0 && (
                        <ul className="mt-4 flex flex-wrap gap-2">
                            {p.benefits.map((b) => (
                                <li key={b} className="px-3 py-1.5 rounded-full bg-brand-500/10 text-brand-500 text-[11px] font-bold">
                                    {b}
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="mt-6">
                        {hasPrice ? (
                            <>
                                <div className="flex items-baseline gap-3 flex-wrap">
                                    <span className="text-[28px] font-black text-content dark:text-white tabular-nums leading-none">
                                        {fmt(p.price, baseCur)}
                                    </span>
                                    {enOferta && (
                                        <span className="text-[16px] font-bold text-content-subtle line-through tabular-nums leading-none">
                                            {fmt(p.price_before, baseCur)}
                                        </span>
                                    )}
                                    {enOferta && (
                                        <span className="px-2 py-0.5 rounded-full bg-brand-500 text-white text-[11px] font-black tabular-nums">
                                            −{Math.round(p.discount_pct)}%
                                        </span>
                                    )}
                                </div>
                                {altCur && (
                                    <div className="text-[13px] font-medium text-content-muted tabular-nums mt-1">
                                        {fmt(p.price, altCur)}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-[15px] font-bold text-content-muted">Consultar precio</div>
                        )}

                        {/* Dónde una tienda con pasarela pondría impuestos y cuotas, aquí va lo
                            que de verdad pasa: cómo se cierra la compra en este catálogo. */}
                        <p className="text-[11px] font-medium text-content-muted mt-1.5">
                            Se coordina el pago con la tienda al confirmar tu pedido.
                        </p>
                    </div>

                    {canOrder && (
                        <button
                            onClick={() => onAdd(p)}
                            disabled={!p.available || !hasPrice}
                            className={[
                                "mt-5 w-full sm:w-auto sm:min-w-[280px] h-12 px-8 rounded-full",
                                "text-[12px] font-bold uppercase tracking-widest",
                                "flex items-center justify-center gap-2",
                                "transition-all duration-200 enabled:active:scale-[0.98]",
                                !p.available || !hasPrice
                                    ? "bg-surface-2 dark:bg-white/[0.05] text-content-subtle cursor-not-allowed"
                                    : "bg-brand-500 text-white hover:brightness-110",
                            ].join(" ")}
                        >
                            {!p.available ? "Agotado" : !hasPrice ? "Consultar precio" : inCart
                                ? `En tu carrito · ${fmtQtyUnit(inCart.qty, p.unit)}`
                                : "Agregar al carrito"}
                        </button>
                    )}
                </div>
            </div>
        </main>
    );
}
