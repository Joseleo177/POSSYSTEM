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
// Tarjetas grandes, con la foto entera: las fotos de categoría de una tienda de marca son
// piezas de campaña, y recortarlas chicas (o en arco, como se probó) las desperdiciaba. El
// nombre va en una etiqueta de vidrio esmerilado al pie, no sobre un velo negro: el velo es la
// plantilla de cualquier tienda y en fotos claras ensuciaba justo lo que se quería lucir. La
// flecha de la etiqueta gira hacia arriba al pasar el cursor y la foto se acerca.
//
// Una categoría sin foto no se disfraza de foto: lleva el tinte de la marca y la inicial grande.
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
                className="flex gap-4 md:gap-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-px-4 px-4 pt-2 pb-3"
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
                            className={`group snap-start shrink-0 w-[152px] sm:w-[184px] lg:w-[206px] text-left rounded-[26px] outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${visto ? "reveal-up" : "opacity-0"}`}
                        >
                            <span className="block relative aspect-[4/5] rounded-[26px] overflow-hidden isolate bg-gradient-to-br from-brand-500/[0.16] to-brand-500/[0.04] dark:from-brand-500/25 dark:to-white/[0.03] transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] [@media(hover:hover)]:group-hover:-translate-y-1">
                                {c.image_url ? (
                                    <img
                                        src={resolveImageUrl(c.image_url)}
                                        alt=""
                                        loading="lazy"
                                        onError={imgRetryOnError}
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] [@media(hover:hover)]:group-hover:scale-[1.06]"
                                    />
                                ) : (
                                    <span className="absolute left-4 top-3 font-display text-[64px] leading-none font-semibold text-brand-500/35 select-none">
                                        {nombre.charAt(0)}
                                    </span>
                                )}

                                <span className="absolute inset-x-2 bottom-2 rounded-[19px] bg-white/80 dark:bg-neutral-900/60 backdrop-blur-md ring-1 ring-white/60 dark:ring-white/10 shadow-[0_6px_20px_-8px_rgba(0,0,0,.35)] pl-3 pr-2 py-2 flex items-center gap-2">
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] sm:text-[14px] font-semibold text-content dark:text-white leading-tight line-clamp-2">
                                            {nombre}
                                        </span>
                                        <span className="block mt-0.5 text-[11px] sm:text-[12px] text-content-muted dark:text-white/65">
                                            {n} {n === 1 ? "producto" : "productos"}
                                        </span>
                                    </span>
                                    <span className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-full bg-brand-500 text-white flex items-center justify-center transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.5,1)] [@media(hover:hover)]:group-hover:-rotate-45">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.6}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                                        </svg>
                                    </span>
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
