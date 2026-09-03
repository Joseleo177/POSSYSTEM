import { useState, useEffect, useRef } from "react";
import { publicApi } from "../../../services/api";
import { Card } from "./BoutiqueGrid";

// Carril corto de UNA categoría en la portada, con scroll horizontal — como "Kits Poción" o
// "Duos Perfectos" en las tiendas de referencia. Reemplaza el volcado de "Todos los
// productos" que abría la portada: con 22 productos publicados, esa rejilla plana llenaba la
// pantalla entera antes de que el cliente llegara a ver otra cosa. Aquí cada categoría se
// asoma con unos pocos, y "Ver todos" lleva a su rejilla completa —la misma que ya existía—.
//
// Se pide aparte, no del listado que ya trae el hook: ese listado es de UNA categoría a la
// vez (la que esté filtrada), y la portada necesita varias al mismo tiempo. Es la misma
// llamada de siempre (getProducts con category_id y límite), solo que cada carril hace la
// suya.
const LIMITE = 10;

export default function CategoryProductRow({
    category, token, warehouseId,
    cart, fmt, baseCur, altCur, ordersEnabled, onAdd, onOpenProduct, onSeeAll,
}) {
    const [products, setProducts] = useState(null); // null = cargando
    const [total, setTotal] = useState(0);
    const scrollerRef = useRef(null);
    // Si hay algo cortado a cada lado, AHORA MISMO — no "puede haberlo en teoría". Al abrir,
    // no hay nada cortado a la izquierda todavía, y ese degradado tapando el botón de la
    // primera ficha (que está completa, no cortada) es justo el defecto que se reportó.
    const [bordes, setBordes] = useState({ izq: false, der: false });

    useEffect(() => {
        let alive = true;
        setProducts(null);
        publicApi.getProducts(token, { category_id: category.id, limit: LIMITE, warehouse_id: warehouseId || "" })
            .then((r) => {
                if (!alive) return;
                setProducts(r.data.products || []);
                setTotal(r.data.total || 0);
            })
            .catch(() => alive && setProducts([]));
        return () => { alive = false; };
    }, [token, category.id, warehouseId]);

    // Recalcula qué borde tiene algo cortado detrás: al montar, al redimensionar (el mismo
    // carril puede pasar de "cabe entero" a "hay que desplazar" solo por girar el teléfono),
    // y en cada scroll. El pequeño margen de 4px es para que el redondeo de subpíxeles al
    // final del todo no deje el degradado derecho parpadeando encendido y apagado.
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

    // Una categoría sin nada disponible en esta sucursal no deja un carril vacío en la
    // portada: mismo criterio que el resto del tema, vacío no dibuja chrome de más.
    if (products?.length === 0) return null;

    const desplazar = (dir) => {
        const el = scrollerRef.current;
        if (!el) return;
        el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
    };

    return (
        <section className="max-w-6xl mx-auto px-4 pt-8">
            <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-[16px] font-black text-content dark:text-white">{category.name}</h2>
                {total > LIMITE && (
                    <button
                        type="button"
                        onClick={() => onSeeAll(String(category.id))}
                        className="text-[11px] font-bold uppercase tracking-wide text-brand-500 hover:underline shrink-0"
                    >
                        Ver todos ({total})
                    </button>
                )}
            </div>

            <div className="relative">
                {/* Solo aparece el degradado del lado que de verdad tiene algo cortado detrás.
                    Antes estaba encendido siempre a la izquierda, incluso al abrir el carril
                    —sin nada cortado ahí, porque la primera ficha está completa—, y tapaba su
                    botón y su etiqueta. Además se ve MUY sutil (w-5, opacidad baja): solo
                    tiene que insinuar que hay más, no comerse el contenido de al lado. */}
                {bordes.izq && (
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-5 z-[5] bg-gradient-to-r from-surface-2/70 dark:from-surface-dark/70 to-transparent" />
                )}
                {bordes.der && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-5 z-[5] bg-gradient-to-l from-surface-2/70 dark:from-surface-dark/70 to-transparent" />
                )}

                {/* Misma condición que los degradados: una flecha que no lleva a ningún lado
                    —"anterior" cuando ya se está al principio— es peor que no tenerla. */}
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
                {(bordes.der || products === null) && (
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
                            <div key={i} className="w-[42vw] max-w-[168px] sm:w-[190px] sm:max-w-none shrink-0 snap-start">
                                <div className="aspect-square rounded-2xl bg-surface-2 dark:bg-white/[0.04] animate-pulse" />
                                <div className="pt-3 space-y-2">
                                    <div className="h-2.5 w-1/3 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                                    <div className="h-3 w-3/4 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                                    <div className="h-4 w-1/2 rounded-full bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                                </div>
                            </div>
                        ))
                        : products.map((p, i) => (
                            <div key={p.id} className="w-[42vw] max-w-[168px] sm:w-[190px] sm:max-w-none shrink-0 snap-start">
                                <Card
                                    p={p}
                                    index={i}
                                    inCart={cart.find((it) => it.id === p.id)}
                                    fmt={fmt} baseCur={baseCur} altCur={altCur}
                                    canOrder={ordersEnabled}
                                    onAdd={onAdd}
                                    href={`/catalogo/${token}/p/${p.id}`}
                                    onOpen={() => onOpenProduct(p.id)}
                                />
                            </div>
                        ))}
                </div>
            </div>
        </section>
    );
}
