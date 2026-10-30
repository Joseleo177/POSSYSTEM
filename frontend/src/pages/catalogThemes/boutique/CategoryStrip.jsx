import { useCallback, useEffect, useRef, useState } from "react";
import { resolveImageUrl, imgRetryOnError, toNameCase } from "../../../helpers";
import useReveal from "./useReveal";

// "Nuestras categorías": la fila de categorías que abre la tienda.
//
// Es un atajo, no un filtro más: quien llega sin saber qué busca entra por aquí, y quien ya
// sabe usa el menú o el buscador. Por eso vive solo en la portada —sin búsqueda ni categoría
// activa— y desaparece en cuanto el cliente empieza a filtrar.
//
// Siempre UNA fila. Antes era una rejilla que, con siete categorías, dejaba la séptima sola en
// un segundo renglón y la sección se leía a medio llenar. Ahora es un carril con imán (snap):
// en el teléfono se arrastra con el dedo, y en escritorio lleva flechas que solo aparecen si
// algo queda fuera. El borde que tiene más contenido se desvanece, para que se note que sigue.
//
// La foto va en un arco, con el nombre y el número de productos DEBAJO, sobre la página: la
// foto con velo negro y el nombre blanco encima es la plantilla de cualquier tienda, y en fotos
// claras el velo ensuciaba justo lo que la tienda quería lucir.
//
// Una categoría sin foto no se disfraza de foto: el arco lleva el tinte de la marca y la
// inicial grande.
const FLECHA = "M9 5l7 7-7 7";

const Flecha = ({ dir, onClick, disabled }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={dir < 0 ? "Anteriores" : "Siguientes"}
        className="w-10 h-10 rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-content dark:text-white flex items-center justify-center transition-[opacity,transform,border-color] hover:border-content-subtle/60 enabled:active:scale-90 disabled:opacity-30 disabled:cursor-default"
    >
        <svg className={`w-4 h-4 ${dir < 0 ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={FLECHA} />
        </svg>
    </button>
);

export default function CategoryStrip({ categories, onPick }) {
    const carril = useRef(null);
    const [bordes, setBordes] = useState({ ini: true, fin: true });
    const [seccion, visto] = useReveal();

    const medir = useCallback(() => {
        const el = carril.current;
        if (!el) return;
        setBordes({
            ini: el.scrollLeft <= 4,
            fin: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
        });
    }, []);

    useEffect(() => {
        medir();
        const el = carril.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, [medir, categories?.length]);

    if (!categories?.length) return null;

    // Avanza casi un ancho entero: deja asomando la última tarjeta vista, para no perder el hilo.
    const mover = (dir) => {
        const el = carril.current;
        if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
    };

    const cabe = bordes.ini && bordes.fin;
    const mascara = cabe ? undefined
        : `linear-gradient(to right, ${bordes.ini ? "#000" : "transparent"} 0, #000 48px, #000 calc(100% - 48px), ${bordes.fin ? "#000" : "transparent"} 100%)`;

    return (
        <section ref={seccion} className="max-w-6xl mx-auto pt-8 md:pt-14 md:pb-8">
            <div className="px-4 mb-5 flex items-end justify-between gap-4">
                <h2 className="text-[20px] md:text-[22px] font-bold tracking-tight text-content dark:text-white">Nuestras categorías</h2>
                {!cabe && (
                    <div className="hidden md:flex items-center gap-2">
                        <Flecha dir={-1} onClick={() => mover(-1)} disabled={bordes.ini} />
                        <Flecha dir={1} onClick={() => mover(1)} disabled={bordes.fin} />
                    </div>
                )}
            </div>

            <div
                ref={carril}
                onScroll={medir}
                style={{ maskImage: mascara, WebkitMaskImage: mascara }}
                className="flex gap-4 md:gap-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-px-4 px-4 pb-2"
            >
                {categories.map((c, i) => {
                    const nombre = toNameCase(c.name);
                    const n = c.product_count || 0;
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => onPick(String(c.id))}
                            style={{ "--i": i }}
                            className={`group snap-start shrink-0 w-[128px] sm:w-[150px] lg:w-[158px] text-left ${visto ? "reveal-up" : "opacity-0"}`}
                        >
                            <span className="block relative aspect-[3/4] rounded-t-full rounded-b-[22px] overflow-hidden bg-brand-500/[0.07] dark:bg-white/[0.05] ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]">
                                {c.image_url ? (
                                    <img
                                        src={resolveImageUrl(c.image_url)}
                                        alt=""
                                        loading="lazy"
                                        onError={imgRetryOnError}
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] [@media(hover:hover)]:group-hover:scale-[1.07]"
                                    />
                                ) : (
                                    <span className="absolute inset-0 flex items-center justify-center font-display text-[44px] font-semibold text-brand-500/40 select-none">
                                        {nombre.charAt(0)}
                                    </span>
                                )}
                                {/* Contorno de la marca que se cierra al pasar el cursor: dice
                                    "esto se toca" sin tapar la foto. */}
                                <span className="absolute inset-0 rounded-[inherit] ring-2 ring-inset ring-brand-500 opacity-0 scale-[1.04] transition-[opacity,transform] duration-300 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:scale-100" />
                            </span>

                            <span className="block mt-3 text-[14px] font-semibold text-content dark:text-white leading-snug line-clamp-2">
                                {nombre}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-[12px] text-content-subtle">
                                {n} {n === 1 ? "producto" : "productos"}
                                <svg className="w-3 h-3 transition-transform duration-300 [@media(hover:hover)]:group-hover:translate-x-1 group-hover:text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={FLECHA} />
                                </svg>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
