import { useState, useEffect, useRef } from "react";
import { publicApi } from "../../../services/api";
import { Card } from "./BoutiqueGrid";

// Carril de "Ofertas" en la portada, antes de las categorías: lo que tiene un descuento o una
// promo "compra y lleva" vigente se ve primero, no mezclado en medio del catálogo. Es el mismo
// carril que CategoryProductRow, con la diferencia de qué le pide al servidor:
// `featured=true` en vez de una categoría (ver publicCatalogService).
//
// Antes también entraban todos los combos, y muchos no son ofertas sino productos compuestos
// (un kit armado, un plato con receta): llenaban el carril de cosas sin rebaja. Un combo
// solo aparece si tiene su propio descuento.
//
// Mientras carga no se dibuja nada, ni siquiera el título: si resulta que hoy no hay ofertas,
// el título con un esqueleto debajo aparecía y desaparecía, y se veía como una sección rota.
const LIMITE = 12;

export default function FeaturedRow({
    token, warehouseId,
    cart, fmt, baseCur, altCur, ordersEnabled, onAdd, onQty, onOpenProduct,
}) {
    const [products, setProducts] = useState(null); // null = cargando
    const scrollerRef = useRef(null);
    const [bordes, setBordes] = useState({ izq: false, der: false });

    useEffect(() => {
        let alive = true;
        setProducts(null);
        publicApi.getProducts(token, { featured: "true", limit: LIMITE, warehouse_id: warehouseId || "" })
            .then((r) => { if (alive) setProducts(r.data.products || []); })
            .catch(() => alive && setProducts([]));
        return () => { alive = false; };
    }, [token, warehouseId]);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const actualizar = () => {
            setBordes({
                izq: el.scrollLeft > 4,
                der: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
            });
        };
        actualizar();
        el.addEventListener("scroll", actualizar, { passive: true });
        const ro = new ResizeObserver(actualizar);
        ro.observe(el);
        return () => { el.removeEventListener("scroll", actualizar); ro.disconnect(); };
    }, [products]);

    if (!products?.length) return null;

    const desplazar = (dir) => {
        const el = scrollerRef.current;
        if (!el) return;
        el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
    };

    return (
        <section className="max-w-6xl mx-auto px-4 pt-8 md:pt-14">
            <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-full bg-brand-500/15 text-brand-500 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
                </span>
                <h2 className="text-[20px] font-bold tracking-tight text-content dark:text-white">Ofertas</h2>
            </div>

            <div className="relative">
                {bordes.izq && (
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-5 z-[5] bg-gradient-to-r from-surface-2/70 dark:from-surface-dark/70 to-transparent" />
                )}
                {bordes.der && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-5 z-[5] bg-gradient-to-l from-surface-2/70 dark:from-surface-dark/70 to-transparent" />
                )}

                {bordes.izq && (
                    <button
                        type="button"
                        onClick={() => desplazar(-1)}
                        aria-label="Anterior"
                        className="hidden [@media(hover:hover)]:flex absolute -left-3 top-[76px] z-10 w-8 h-8 rounded-full bg-surface dark:bg-surface-dark-2 border border-border/60 dark:border-white/10 shadow items-center justify-center text-content-muted hover:text-brand-500 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                )}
                {bordes.der && (
                    <button
                        type="button"
                        onClick={() => desplazar(1)}
                        aria-label="Siguiente"
                        className="hidden [@media(hover:hover)]:flex absolute -right-3 top-[76px] z-10 w-8 h-8 rounded-full bg-surface dark:bg-surface-dark-2 border border-border/60 dark:border-white/10 shadow items-center justify-center text-content-muted hover:text-brand-500 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                )}

                <div ref={scrollerRef} className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory pb-1">
                    {products === null
                        ? Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="w-[42vw] max-w-[180px] sm:max-w-none sm:w-[calc((100%_-_2rem)/3)] md:w-[calc((100%_-_3rem)/4)] lg:w-[calc((100%_-_4rem)/5)] shrink-0 snap-start">
                                <div className="aspect-square rounded-2xl skeleton" />
                                <div className="pt-3 space-y-2">
                                    <div className="h-2.5 w-1/3 rounded-full skeleton" />
                                    <div className="h-3 w-3/4 rounded-full skeleton" />
                                    <div className="h-4 w-1/2 rounded-full skeleton" />
                                </div>
                            </div>
                        ))
                        : products.map((p, i) => (
                            <div key={p.id} className="w-[42vw] max-w-[180px] sm:max-w-none sm:w-[calc((100%_-_2rem)/3)] md:w-[calc((100%_-_3rem)/4)] lg:w-[calc((100%_-_4rem)/5)] shrink-0 snap-start">
                                <Card
                                    p={p}
                                    index={i}
                                    inCart={cart.find((it) => it.id === p.id)}
                                    fmt={fmt} baseCur={baseCur} altCur={altCur}
                                    canOrder={ordersEnabled}
                                    onAdd={onAdd} onQty={onQty}
                                    href={`/catalogo/${token}/p/${p.id}`}
                                    onOpen={() => onOpenProduct(p.id)}
                                    showPromo
                                />
                            </div>
                        ))}
                </div>
            </div>
        </section>
    );
}
