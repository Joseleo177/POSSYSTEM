import { useState, useEffect } from "react";
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
    store, onOpenProduct,
}) {
    // La descripción larga arranca recortada. Vuelve a recortarse al pasar a otro producto
    // (por ejemplo, desde una pieza del kit).
    const [verTodo, setVerTodo] = useState(false);
    useEffect(() => { setVerTodo(false); }, [p?.id]);

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
    // Unas cinco líneas en escritorio: por debajo de eso, recortar solo añade un clic.
    const largo = (p.description_paragraphs || []).join(" ").length > 320;
    // Con el nombre del producto ya escrito: el cliente no tiene que explicar de cuál habla.
    const waHref = store?.whatsapp
        ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(`Hola, quiero consultar por: ${p.name}`)}`
        : null;

    return (
        <main className="max-w-5xl mx-auto px-4 py-6 md:py-8">
            {/* Antes era una miga "Tienda / CATEGORÍA": en un teléfono no se leía como algo
                que se toca, y nadie la asociaba con volver. Ahora es un botón de volver con
                su flecha —regresa a donde estaba el cliente, portada o categoría filtrada— y,
                aparte, un enlace explícito a ver el resto de la categoría del producto. */}
            <nav className="flex items-center justify-between gap-3 mb-5">
                {/* onBack() y no onBack directo: como manejador de clic, React le pasa el
                    evento como primer argumento, y onBack lo toma como el id de categoría —
                    setCategory terminaba con el SyntheticEvent en vez de un id, y la
                    siguiente consulta de productos reventaba. */}
                <button
                    type="button"
                    onClick={() => onBack()}
                    className="shrink-0 inline-flex items-center gap-1.5 h-10 pl-2.5 pr-4 rounded-full bg-surface-2 dark:bg-white/[0.06] border border-border/60 dark:border-white/10 text-[13px] font-bold text-content dark:text-white hover:border-brand-500/50 hover:text-brand-500 transition-colors active:scale-95"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    Volver
                </button>
                {p.category && (
                    <button
                        type="button"
                        onClick={() => onBack(String(p.category.id))}
                        className="min-w-0 inline-flex items-center gap-1 text-[12px] font-bold text-brand-500 hover:underline"
                    >
                        <span className="truncate">Ver más de {p.category.name}</span>
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                )}
            </nav>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 md:items-start">
                {/* Fija en escritorio mientras se baja por la descripción y el kit: la foto
                    sigue a la vista junto al texto que la describe. */}
                <div className={`md:sticky md:top-40 aspect-square rounded-2xl bg-surface-2 dark:bg-white/[0.04] border border-border/40 dark:border-white/[0.06] relative overflow-hidden ${!p.available ? "opacity-60" : ""}`}>
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

                {/* Orden de la columna: primero lo que decide la compra (qué es, cuánto
                    cuesta, si hay, el botón) y después lo que la respalda (qué incluye, la
                    descripción). Antes la descripción iba en medio y en un producto con texto
                    largo empujaba el precio y el botón fuera de la pantalla. */}
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        {p.brand && (
                            <span className="px-2.5 py-1 rounded-full bg-content/[0.06] dark:bg-white/[0.08] text-[10px] font-black uppercase tracking-[0.14em] text-content dark:text-white">
                                {p.brand}
                            </span>
                        )}
                        {p.includes?.length > 0 && (
                            <span className="px-2.5 py-1 rounded-full bg-brand-500/10 text-[10px] font-black uppercase tracking-[0.14em] text-brand-500">
                                {/* Un combo de una sola pieza es una caja o paquete (12 latas),
                                    no un kit: "Kit · 1 producto" no decía nada útil. */}
                                {p.includes.length === 1
                                    ? `Contiene ${fmtQtyUnit(p.includes[0].quantity, p.includes[0].unit)}`
                                    : `Kit · ${p.includes.length} productos`}
                            </span>
                        )}
                    </div>

                    <h1 className="mt-3 text-[26px] md:text-[34px] font-black text-content dark:text-white leading-[1.1] tracking-tight">
                        {p.name}
                    </h1>

                    {p.short_description && (
                        <p className="mt-3 text-[15px] font-medium text-content-muted leading-relaxed">{p.short_description}</p>
                    )}

                    {p.benefits?.length > 0 && (
                        <ul className="mt-4 flex flex-wrap gap-2">
                            {p.benefits.map((b) => (
                                <li key={b} className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full bg-brand-500/10 text-brand-500 text-[11px] font-bold">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    {b}
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* ── Compra ── */}
                    <div className="mt-6 rounded-2xl bg-surface dark:bg-surface-dark-2 border border-border/60 dark:border-white/[0.06] p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                {hasPrice ? (
                                    <>
                                        <div className="flex items-baseline gap-2.5 flex-wrap">
                                            <span className="text-[30px] font-black text-content dark:text-white tabular-nums leading-none">
                                                {fmt(p.price, baseCur)}
                                            </span>
                                            {enOferta && (
                                                <span className="text-[15px] font-bold text-content-subtle line-through tabular-nums leading-none">
                                                    {fmt(p.price_before, baseCur)}
                                                </span>
                                            )}
                                        </div>
                                        {altCur && (
                                            <div className="text-[13px] font-semibold text-content-muted tabular-nums mt-1.5">
                                                {fmt(p.price, altCur)}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-[16px] font-black text-content dark:text-white">Consultar precio</div>
                                )}
                            </div>

                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${p.available
                                    ? "bg-success/10 text-success"
                                    : "bg-danger/10 text-danger"}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${p.available ? "bg-success" : "bg-danger"}`} />
                                    {p.available ? "Disponible" : "Agotado"}
                                </span>
                                {enOferta && (
                                    <span className="px-2.5 py-1 rounded-full bg-brand-500 text-white text-[10px] font-black tabular-nums">
                                        −{Math.round(p.discount_pct)}%
                                    </span>
                                )}
                                {p.promo_label && (
                                    <span className="px-2.5 py-1 rounded-full bg-brand-500 text-white text-[10px] font-black uppercase tracking-wider">
                                        Promo {p.promo_label}
                                    </span>
                                )}
                            </div>
                        </div>

                        {(canOrder || waHref) && (
                            <div className="mt-5 flex flex-col sm:flex-row gap-2">
                                {canOrder && (
                                    <button
                                        onClick={() => onAdd(p)}
                                        disabled={!p.available || !hasPrice}
                                        className={[
                                            // flex-1 solo en fila (sm): en la columna del
                                            // teléfono reparte el ALTO y aplastaba el botón.
                                            "w-full sm:w-auto sm:flex-1 shrink-0 h-12 px-6 rounded-full",
                                            "text-[12px] font-black uppercase tracking-widest",
                                            "flex items-center justify-center gap-2",
                                            "transition-all duration-200 enabled:active:scale-[0.98]",
                                            !p.available || !hasPrice
                                                ? "bg-surface-2 dark:bg-white/[0.05] text-content-subtle cursor-not-allowed"
                                                : "bg-brand-500 text-white hover:brightness-110 shadow-lg shadow-brand-500/25",
                                        ].join(" ")}
                                    >
                                        {p.available && hasPrice && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17M17 17a2 2 0 100 4 2 2 0 000-4zM9 19a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                        )}
                                        {!p.available ? "Agotado" : !hasPrice ? "Consultar precio" : inCart
                                            ? `En tu carrito · ${fmtQtyUnit(inCart.qty, p.unit)}`
                                            : "Agregar al carrito"}
                                    </button>
                                )}
                                {/* Preguntar antes de comprar: sobre todo si está agotado o
                                    sin precio, que es cuando el botón principal no sirve. */}
                                {waHref && (
                                    <a
                                        href={waHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`${canOrder ? "sm:flex-none" : "sm:flex-1"} w-full sm:w-auto shrink-0 h-12 px-5 rounded-full border border-border dark:border-white/15 text-[12px] font-black uppercase tracking-widest text-content dark:text-white flex items-center justify-center gap-2 hover:border-brand-500 hover:text-brand-500 transition-colors`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                        Preguntar
                                    </a>
                                )}
                            </div>
                        )}

                        {/* Dónde una tienda con pasarela pondría impuestos y cuotas, aquí va lo
                            que de verdad pasa: cómo se cierra la compra en este catálogo. */}
                        <p className="mt-4 pt-4 border-t border-border/50 dark:border-white/[0.06] flex items-center gap-2 text-[11px] font-medium text-content-muted">
                            <svg className="w-4 h-4 shrink-0 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            El pago se coordina con la tienda al confirmar tu pedido.
                        </p>
                    </div>

                    {/* ── Qué incluye (kits) ── */}
                    {p.includes?.length > 0 && (
                        <section className="mt-8">
                            <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-content dark:text-white mb-3">Incluye</h2>
                            <ul className="space-y-2">
                                {p.includes.map((it, idx) => {
                                    const Tag = it.id && onOpenProduct ? "button" : "div";
                                    return (
                                        <li key={idx}>
                                            <Tag
                                                {...(Tag === "button" ? { type: "button", onClick: () => onOpenProduct(it.id) } : {})}
                                                className={`w-full flex items-center gap-3 p-2 pr-3 rounded-xl bg-surface dark:bg-surface-dark-2 border border-border/60 dark:border-white/[0.06] text-left ${Tag === "button" ? "hover:border-brand-500/50 transition-colors" : ""}`}
                                            >
                                                <span className="w-14 h-14 shrink-0 rounded-lg bg-surface-2 dark:bg-white/[0.04] overflow-hidden flex items-center justify-center">
                                                    {it.image_url
                                                        ? <img src={resolveImageUrl(it.image_url)} alt="" onError={imgRetryOnError} className="w-full h-full object-cover" />
                                                        : <span className="text-[18px] font-black text-brand-500/30">{it.name.charAt(0)}</span>}
                                                </span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-[13px] font-bold text-content dark:text-white leading-snug">{it.name}</span>
                                                    <span className="block text-[11px] font-semibold text-content-muted mt-0.5 tabular-nums">
                                                        {fmtQtyUnit(it.quantity, it.unit)}
                                                    </span>
                                                </span>
                                                {Tag === "button" && (
                                                    <svg className="w-4 h-4 shrink-0 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                                )}
                                            </Tag>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {/* ── Descripción ── */}
                    {p.description_paragraphs?.length > 0 && (
                        <section className="mt-8">
                            <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-content dark:text-white mb-3">Descripción</h2>
                            <div className={`relative space-y-3 ${largo && !verTodo ? "max-h-[132px] overflow-hidden" : ""}`}>
                                {p.description_paragraphs.map((par, i) => (
                                    <p key={i} className="text-[14px] font-medium text-content-muted leading-relaxed">{par}</p>
                                ))}
                                {largo && !verTodo && (
                                    <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-surface-2 dark:from-surface-dark to-transparent" />
                                )}
                            </div>
                            {largo && (
                                <button
                                    type="button"
                                    onClick={() => setVerTodo(v => !v)}
                                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-black uppercase tracking-widest text-brand-500 hover:underline"
                                >
                                    {verTodo ? "Ver menos" : "Leer más"}
                                    <svg className={`w-3.5 h-3.5 transition-transform ${verTodo ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                </button>
                            )}
                        </section>
                    )}
                </div>
            </div>
        </main>
    );
}
