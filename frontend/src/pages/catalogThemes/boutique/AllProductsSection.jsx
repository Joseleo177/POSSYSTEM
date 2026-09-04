import { useState, useEffect, useRef } from "react";
import { publicApi } from "../../../services/api";
import { Card } from "./BoutiqueGrid";

// Cierre de la portada: pestañas por categoría sobre UN carril horizontal, igual que los de
// arriba — no una rejilla completa. La primera versión de esto era una parrilla paginada de
// varias filas y volvía a saturar la página exactamente por lo que se armó todo esto
// (CategoryProductRow ya existe por la misma razón). Las pestañas cambian qué categoría se
// ve en el carril, "Ver todos" sigue llevando a la rejilla completa de siempre.
//
// Estado propio y no el `category`/`setCategory` de arriba: elegir una pestaña acá cambia
// SOLO este carril, no convierte toda la página en la vista de listado.
const LIMITE = 12;

export default function AllProductsSection({
    categories, token, warehouseId,
    cart, fmt, baseCur, altCur, ordersEnabled, onAdd, onOpenProduct, onSeeAll,
}) {
    const [categoryId, setCategoryId] = useState("");
    const [products, setProducts] = useState(null); // null = todavía no llegó la primera carga
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const scrollerRef = useRef(null);
    const [bordes, setBordes] = useState({ izq: false, der: false });

    // No se vacía `products` a null en cada cambio de pestaña —eso era el golpe: la fila
    // desaparecía entera a los cuadros grises de carga y volvía a llenarse de un tirón—. La
    // fila anterior se queda a la vista (atenuada por `loading`, ver el contenedor más abajo)
    // hasta que la nueva esté lista, y ahí se reemplaza de una vez. El esqueleto gris solo se
    // ve en la primera carga de la sección, cuando de verdad no hay nada que mostrar todavía.
    useEffect(() => {
        let alive = true;
        setLoading(true);
        publicApi.getProducts(token, { category_id: categoryId || "", limit: LIMITE, warehouse_id: warehouseId || "" })
            .then((r) => {
                if (!alive) return;
                setProducts(r.data.products || []);
                setTotal(r.data.total || 0);
            })
            .catch(() => alive && setProducts([]))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [token, categoryId, warehouseId]);

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

    if (!categories?.length) return null;

    const desplazar = (dir) => {
        const el = scrollerRef.current;
        if (!el) return;
        el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
    };

    return (
        <section className="max-w-6xl mx-auto px-4 pt-14 pb-4">
            <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="text-[20px] font-black text-content dark:text-white shrink-0">Nuestros productos</h2>

                {/* Pestañas EN LA MISMA LÍNEA que el título, no debajo — así lo tienen las
                    referencias. Solo la activa lleva píldora de color; las demás son texto
                    plano, para que la fila no se lea como una hilera de botones repetidos. */}
                <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide min-w-0">
                    <button
                        type="button"
                        onClick={() => setCategoryId("")}
                        className={!categoryId
                            ? "shrink-0 h-8 px-4 rounded-full bg-brand-500 text-white text-[11px] font-black uppercase tracking-wide"
                            : "shrink-0 text-[12px] font-bold uppercase tracking-wide text-content-subtle hover:text-content dark:hover:text-white transition-colors"}
                    >
                        Todos
                    </button>
                    {categories.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => setCategoryId(String(c.id))}
                            className={String(categoryId) === String(c.id)
                                ? "shrink-0 h-8 px-4 rounded-full bg-brand-500 text-white text-[11px] font-black uppercase tracking-wide"
                                : "shrink-0 text-[12px] font-bold uppercase tracking-wide text-content-subtle hover:text-content dark:hover:text-white transition-colors"}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Sin categoría elegida ("Todos") no hay a dónde llevar el "Ver todos": la
                portada ES la vista sin filtrar, no hay una rejilla completa aparte para "todo
                el catálogo" — solo por categoría. */}
            {categoryId && total > LIMITE && (
                <div className="flex justify-end -mt-3 mb-3">
                    <button
                        type="button"
                        onClick={() => onSeeAll(categoryId)}
                        className="text-[11px] font-bold uppercase tracking-wide text-brand-500 hover:underline"
                    >
                        Ver todos ({total})
                    </button>
                </div>
            )}

            {products?.length === 0 ? (
                <div className="py-12 text-center">
                    <p className="text-[13px] font-bold text-content dark:text-white">No hay productos en esta categoría</p>
                </div>
            ) : (
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

                    {/* La fila anterior se atenúa mientras llega la nueva, en vez de
                        desaparecer: la transición de opacidad es lo que hace que el cambio
                        de pestaña se sienta como un cruce suave y no como un tirón. */}
                    <div
                        ref={scrollerRef}
                        className={`flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory pb-1 transition-opacity duration-200 ${loading && products !== null ? "opacity-40" : "opacity-100"}`}
                    >
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
                                // La categoría va en la key a propósito: un producto que ya
                                // estaba montado en la pestaña anterior (aparece en "Todos" Y
                                // en "Almuerzos", por ejemplo) se reaprovechaba tal cual al
                                // cambiar de pestaña —React lo reconoce por el mismo id— y esa
                                // tarjeta se quedaba quieta mientras las demás sí entraban con
                                // la animación: la mezcla se veía como que "algunas caen de
                                // golpe". Con la categoría en la key, cada cambio de pestaña
                                // rehace TODAS las tarjetas, así que animan siempre parejo.
                                <div key={`${categoryId}-${p.id}`} className="w-[42vw] max-w-[168px] sm:w-[190px] sm:max-w-none shrink-0 snap-start">
                                    <Card
                                        p={p}
                                        index={i}
                                        inCart={cart.find((it) => it.id === p.id)}
                                        fmt={fmt} baseCur={baseCur} altCur={altCur}
                                        canOrder={ordersEnabled}
                                        onAdd={onAdd}
                                        href={`/catalogo/${token}/p/${p.id}`}
                                        onOpen={() => onOpenProduct(p.id)}
                                        fadeOnly
                                    />
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </section>
    );
}
