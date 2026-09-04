import { useEffect, useRef } from "react";
import { resolveImageUrl, imgRetryOnError } from "../../../helpers";
import { fmtQtyUnit } from "../../../helpers/unitFormatter";

// Rejilla de la vitrina de marca. Misma paginación por scroll que la estándar; lo que cambia
// es la tarjeta, que aquí muestra lo que muestran las tiendas de marca: la línea del producto
// encima del nombre, una frase de beneficio debajo, y el precio anterior tachado cuando hay
// una promoción vigente.
//
// Esos tres datos son opcionales. Un producto que no los tenga cargados se ve como en el tema
// estándar —foto, nombre, precio— y la tarjeta no queda coja: cada bloque simplemente no se
// dibuja. Es lo que permite estrenar el tema sin haber editado antes los cientos de productos.

// Se exporta para que CategoryProductRow (las filas cortas de la portada) pinte la misma
// ficha dentro de un carril con scroll horizontal, en vez de reescribirla: la portada y la
// vista de "toda la categoría" tienen que verse como la misma tienda.
// showPromo: solo lo enciende FeaturedRow ("Ofertas y combos"). Es la sección donde la
// tienda decidió resaltar sus promos "compra y lleva" — en cualquier otra parte donde este
// mismo producto aparezca (una categoría, el buscador, un carril de portada) se ve y se
// agrega como uno más, sin la insignia ni el salto directo a la cantidad completa. El
// descuento en sí sigue aplicándose en cuanto la cantidad de la línea cruce el mínimo, esté
// o no la insignia — eso no depende de por dónde se agregó.
// fadeOnly: solo lo enciende AllProductsSection. Ahí la tarjeta se rehace en el mismo lugar
// cada vez que se cambia de pestaña (ver la key con la categoría, más abajo) — el
// deslizamiento desde abajo que usan las demás secciones (pensado para una entrada de página,
// una sola vez) ahí se veía como que la fila entera daba un salto cada vez que se tocaba una
// pestaña. Con fadeOnly la tarjeta se queda quieta y solo el contenido aparece.
export function Card({ p, inCart, fmt, baseCur, altCur, canOrder, onAdd, index, href, onOpen, showPromo = false, fadeOnly = false }) {
    const price = parseFloat(p.price);
    const hasPrice = price > 0;
    // price_before solo llega cuando el descuento realmente baja el precio (lo decide el
    // servidor), así que aquí no hay que volver a comprobar que sea mayor.
    const enOferta = hasPrice && p.price_before != null;

    // La foto y el nombre son un enlace de verdad —href a /p/<id>—, no solo un manejador de
    // clic: así "abrir en pestaña nueva" y "copiar enlace" funcionan sobre la ficha, que es
    // justo lo que alguien intenta al querer compartir un producto puntual. preventDefault
    // solo entra cuando es un clic normal, para navegar dentro del catálogo sin recargar la
    // página; un clic con Ctrl/⌘ o el del medio sigue el href tal cual.
    const abrir = (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpen();
    };

    return (
        // La ficha NO es una caja: no lleva fondo, ni borde, ni sombra propia.
        //
        // Encajonar foto, nombre, precio y botón dentro de un rectángulo blanco hace que la
        // rejilla se lea como una tabla de inventario —cada producto en su celda— en vez de
        // como una vitrina. Las tiendas de referencia hacen justo lo contrario: la foto vive
        // en su propio recuadro y el texto queda suelto debajo, sobre el fondo de la página.
        // Lo que separa un producto de otro es el aire entre ellos, no una línea.
        <article
            style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
            className={`group relative flex flex-col animate-in fade-in fill-mode-backwards ${fadeOnly ? "" : "slide-in-from-bottom-2"}`}
        >
            {/* El recuadro es SOLO de la foto. Aquí sí hay fondo, porque casi todas las fotos
                de producto vienen recortadas sobre blanco y sin él flotarían sin apoyo.
                Agotado apaga la foto y nada más: con la ficha entera al 60% el nombre y el
                precio quedaban ilegibles y el producto parecía un error de carga. */}
            <a
                href={href}
                onClick={abrir}
                aria-label={p.name}
                className={[
                    "block aspect-square relative overflow-hidden rounded-2xl",
                    "bg-surface-2 dark:bg-white/[0.04]",
                    "border transition-colors duration-300",
                    inCart ? "border-brand-500/40" : "border-border/40 dark:border-white/[0.06]",
                    !p.available ? "opacity-50" : "",
                ].join(" ")}>
                {p.image_url ? (
                    <img
                        src={resolveImageUrl(p.image_url)}
                        alt={p.name}
                        loading="lazy"
                        onError={imgRetryOnError}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out [@media(hover:hover)]:group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-500/5 to-brand-500/[0.12]">
                        <span className="text-4xl font-black text-brand-500/25 select-none">{p.name.charAt(0)}</span>
                    </div>
                )}

                {enOferta && p.available && (
                    <span className="absolute top-2.5 left-2.5 px-2 py-1 rounded-full bg-brand-500 text-white text-[10px] font-black shadow-sm tabular-nums">
                        −{Math.round(p.discount_pct)}%
                    </span>
                )}

                {/* "Compra y lleva" no tiene precio tachado que mostrar —el pedido web se
                    cobra al precio normal, la unidad gratis se resuelve en caja (ver
                    descuentosVigentes en publicCatalogService)—, así que aquí solo es un
                    aviso: mismo lugar que el listón de %, nunca junto con él. */}
                {showPromo && !enOferta && p.promo_label && p.available && (
                    <span className="absolute top-2.5 left-2.5 px-2 py-1 rounded-full bg-brand-500 text-white text-[10px] font-black shadow-sm tabular-nums">
                        {p.promo_label}
                    </span>
                )}

                {!p.available && (
                    <span className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-danger/90 backdrop-blur text-white text-[9px] font-bold uppercase tracking-wide shadow-sm">
                        Agotado
                    </span>
                )}

                {inCart && (
                    <span className="absolute bottom-2.5 left-2.5 h-6 px-2 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-md animate-in zoom-in-50 duration-300 tabular-nums">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        {fmtQtyUnit(inCart.qty, p.unit)}
                    </span>
                )}
            </a>

            {/* Texto suelto, sin caja ni relleno lateral: se alinea con el borde de la foto.
                Las alturas siguen reservadas aunque el dato falte —un producto sin marca
                desalineaba los precios de toda su fila y la rejilla se leía como mal
                cargada—, pero ahora lo que iguala las fichas es el ritmo, no un rectángulo. */}
            <div className="pt-3 flex flex-col flex-1">
                {/* La marca sustituye a la categoría cuando existe: en una tienda,
                    "Poción Kids" dice más que "CAPILAR", y poner las dos llena la ficha de
                    texto pequeño antes de llegar al nombre. */}
                <span className="block h-[14px] text-[10px] font-semibold uppercase tracking-wide text-content-muted truncate">
                    {p.brand || p.category_name || ""}
                </span>

                {/* El nombre en el color de la tienda, como en las referencias: es lo que le
                    da carácter a la rejilla ahora que no hay tarjetas de por medio. También
                    es enlace, para que el nombre —no solo la foto— lleve a la ficha. */}
                <a href={href} onClick={abrir} className="mt-1 min-h-[38px] block text-[14px] font-bold text-brand-500 leading-snug line-clamp-2 hover:underline">
                    {p.name}
                </a>

                {/* Altura reservada como la marca y el nombre de arriba: si solo se dibuja
                    cuando el dato existe, la tarjeta con frase de beneficio queda una línea
                    más alta que sus vecinas y el precio/botón se desalinean entre sí en la
                    misma fila. */}
                <p className="mt-0.5 h-[15px] text-[11px] font-medium text-content-muted leading-snug line-clamp-1">
                    {p.short_description || ""}
                </p>

                <div className="mt-auto pt-2.5">
                    {hasPrice ? (
                        <>
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-[17px] font-black text-content dark:text-white tabular-nums leading-none">
                                    {fmt(p.price, baseCur)}
                                </span>
                                {enOferta && (
                                    <span className="text-[12px] font-bold text-content-subtle line-through tabular-nums leading-none">
                                        {fmt(p.price_before, baseCur)}
                                    </span>
                                )}
                            </div>
                            {altCur && (
                                <div className="text-[11px] font-medium text-content-muted tabular-nums mt-1">
                                    {fmt(p.price, altCur)}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-[11px] font-bold text-content-muted">Consultar precio</div>
                    )}
                </div>

                {/* El botón ocupa su sitio siempre, incluso agotado. Antes desaparecía y la
                    ficha se quedaba corta: en una fila donde las demás sí lo tenían, el precio
                    del agotado se iba al fondo dejando un boquete en medio. */}
                {canOrder && (
                    <button
                        onClick={() => onAdd(p, showPromo)}
                        disabled={!p.available || !hasPrice}
                        className={[
                            "mt-3 h-10 rounded-full text-[10px] font-bold uppercase tracking-widest",
                            "flex items-center justify-center gap-1.5",
                            "transition-all duration-200 enabled:active:scale-[0.97]",
                            !p.available || !hasPrice
                                ? "bg-surface-2 dark:bg-white/[0.05] text-content-subtle cursor-not-allowed"
                                : inCart
                                    ? "bg-brand-500/10 text-brand-500 border border-brand-500/30 hover:bg-brand-500/15"
                                    : "bg-brand-500 text-white hover:brightness-110",
                        ].join(" ")}
                    >
                        {!p.available ? "Agotado"
                            : !hasPrice ? "Consultar"
                                : inCart ? "Agregar otro" : "Agregar al carrito"}
                    </button>
                )}
            </div>
        </article>
    );
}

export default function BoutiqueGrid({
    products, total, loading, loadingMore, loadMore,
    cart, fmt, baseCur, altCur, ordersEnabled, onAdd,
    token, onOpenProduct,
    title,
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
        <main className="max-w-6xl mx-auto px-4 pt-8 pb-4">
            {title && (
                <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-[15px] font-black text-content dark:text-white">{title}</h2>
                    {/* Con el número solo, en la esquina se leía un "7" suelto que no se
                        entendía de qué era. */}
                    {!loading && total > 0 && (
                        <span className="text-[11px] font-medium text-content-subtle tabular-nums">
                            {total} {total === 1 ? "producto" : "productos"}
                        </span>
                    )}
                </div>
            )}

            {loading ? (
                // El esqueleto imita la ficha sin caja: recuadro de foto y renglones sueltos
                // debajo. Si dibujara tarjetas, la rejilla daría un salto al llegar los datos.
                <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-4 gap-y-8">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i}>
                            <div className="aspect-square rounded-2xl bg-surface-2 dark:bg-white/[0.04] animate-pulse" />
                            <div className="pt-3 space-y-2">
                                <div className="h-2.5 w-1/3 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                                <div className="h-3 w-3/4 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                                <div className="h-4 w-1/2 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : products.length === 0 ? (
                <div className="py-24 flex flex-col items-center gap-3 text-center animate-in fade-in duration-300">
                    <div className="w-16 h-16 rounded-3xl bg-surface-2 dark:bg-white/5 flex items-center justify-center text-content-subtle">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <p className="text-[13px] font-bold text-content dark:text-white">No encontramos productos</p>
                    <p className="text-[11px] font-medium text-content-muted">Prueba con otra búsqueda o categoría.</p>
                </div>
            ) : (
                <>
                    {/* Más aire vertical que horizontal: sin cajas, lo único que separa una
                        ficha de la de abajo es ese hueco. Con el gap parejo, el botón de una
                        fila y la foto de la siguiente se leían como si fueran del mismo
                        producto. */}
                    <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-4 gap-y-8">
                        {products.map((p, i) => (
                            <Card
                                key={p.id}
                                p={p}
                                index={i}
                                inCart={cart.find(it => it.id === p.id)}
                                fmt={fmt} baseCur={baseCur} altCur={altCur}
                                canOrder={ordersEnabled}
                                onAdd={onAdd}
                                href={`/catalogo/${token}/p/${p.id}`}
                                onOpen={() => onOpenProduct(p.id)}
                            />
                        ))}
                    </div>

                    <div ref={sentinelRef} className="h-8" />

                    {loadingMore && (
                        <div className="py-4 text-center text-[11px] font-bold uppercase tracking-widest text-content-subtle animate-pulse">
                            Cargando más
                        </div>
                    )}
                </>
            )}
        </main>
    );
}
