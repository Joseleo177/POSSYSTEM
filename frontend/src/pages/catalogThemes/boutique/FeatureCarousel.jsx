import { useState, useEffect, useRef } from "react";
import { resolveImageUrl } from "../../../helpers";
import { oracion } from "./BrandStatement";

// Carrusel de destacados, al final de la portada: la imagen de un lado y, del otro, lo que la
// tienda quiere contar de ese producto o línea ("Ideal para reconstrucción inmediata…").
//
// Es el contrapunto del carrusel de portada. Allá el mensaje va dentro del arte porque es una
// campaña; aquí el texto lo escribe el comercio en Ajustes → Vitrina y lo pinta la vitrina,
// así que se lee igual de bien en cualquier pantalla y se cambia sin rehacer la imagen.
//
// Va como pieza dentro del ancho de la página, igual que el banner de arriba: a todo el ancho
// medía 440px de alto, con la mitad blanca y un título en mayúsculas de 34px, y junto con el
// pie se comía la última pantalla entera. Ahora es una tarjeta de ~300px con el texto sobre un
// tinte de la marca, el título en oración y el mismo indicador que se llena del banner.

const AVANCE_MS = 7000;

export default function FeatureCarousel({ features }) {
    const [i, setI] = useState(0);
    const [pausado, setPausado] = useState(false);
    const tactoX = useRef(null);
    const total = features?.length || 0;

    useEffect(() => {
        if (total < 2 || pausado) return;
        const t = setTimeout(() => setI((n) => (n + 1) % total), AVANCE_MS);
        return () => clearTimeout(t);
    }, [i, total, pausado]);

    // Si la lista se achica (la tienda apagó uno), no quedarse apuntando a uno que no existe.
    useEffect(() => { if (i >= total) setI(0); }, [total, i]);

    if (!total) return null;

    const ir = (n) => { setI((n + total) % total); setPausado(true); };

    return (
        <div className="max-w-6xl mx-auto px-3 md:px-4 pt-10 md:pt-14 pb-10 md:pb-14">
            <section
                className="relative rounded-2xl md:rounded-[28px] overflow-hidden isolate bg-brand-500/[0.06] dark:bg-white/[0.04] ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]"
                onMouseEnter={() => setPausado(true)}
                onMouseLeave={() => setPausado(false)}
                onTouchStart={(e) => { tactoX.current = e.touches[0].clientX; setPausado(true); }}
                onTouchEnd={(e) => {
                    if (tactoX.current === null) return;
                    const dx = e.changedTouches[0].clientX - tactoX.current;
                    if (Math.abs(dx) > 50) ir(dx < 0 ? i + 1 : i - 1);
                    tactoX.current = null;
                }}
                aria-roledescription="carrusel"
            >
                {/* Una sola rejilla y las diapositivas apiladas en la misma celda: así la
                    sección toma la altura de la más alta y no salta al cambiar de una con texto
                    corto a otra con texto largo. */}
                <div className="grid">
                    {features.map((f, idx) => {
                        const activo = idx === i;
                        return (
                            <div
                                key={f.id}
                                className={`col-start-1 row-start-1 grid grid-cols-1 content-start md:content-stretch md:grid-cols-[5fr_7fr] transition-opacity duration-700 ${activo ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                                aria-hidden={!activo}
                            >
                                {/* En el teléfono la imagen va primero: es lo que detiene el dedo. */}
                                <div className="md:order-2 relative aspect-[16/9] md:aspect-auto md:min-h-[300px] overflow-hidden">
                                    <img
                                        src={resolveImageUrl(f.image_url)}
                                        alt={f.alt_text || f.heading || ""}
                                        className={`absolute inset-0 w-full h-full object-cover transition-transform duration-[7000ms] ease-out ${activo ? "scale-105" : "scale-100"}`}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </div>

                                <div className="md:order-1 flex flex-col justify-start md:justify-center px-6 py-6 md:px-10 md:py-8">
                                    {f.heading && (
                                        <h2 key={activo ? `on-${i}` : "off"} className={`font-display text-[22px] md:text-[28px] font-semibold tracking-tight leading-[1.15] text-content dark:text-white text-balance ${activo ? "expand-in" : ""}`}>
                                            {oracion(f.heading)}
                                        </h2>
                                    )}
                                    {f.body && (
                                        <p className={`text-[13px] md:text-[14px] text-content-muted leading-relaxed max-w-[440px] ${f.heading ? "mt-2.5" : ""}`}>
                                            {f.body}
                                        </p>
                                    )}
                                    {f.link_url && (
                                        <a
                                            href={f.link_url}
                                            tabIndex={activo ? 0 : -1}
                                            className="group/vm mt-5 self-start inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-brand-500 text-white text-[13px] font-semibold hover:brightness-110 transition active:scale-95"
                                        >
                                            Ver más
                                            <svg className="w-3.5 h-3.5 transition-transform group-hover/vm:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.6}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                        </a>
                                    )}
                                    {/* Hueco para los indicadores, que van fuera de la
                                        diapositiva para no desvanecerse con ella. */}
                                    {total > 1 && <div className="h-7" aria-hidden="true" />}
                                </div>
                            </div>
                        );
                    })}

                    {total > 1 && (
                        // Bajo el texto, alineados con él: en escritorio en la columna izquierda,
                        // en el teléfono al pie de la tarjeta. El activo se llena con el tiempo
                        // que dura (como en el banner de arriba).
                        <div className="col-start-1 row-start-1 self-end grid grid-cols-1 md:grid-cols-[5fr_7fr] pointer-events-none">
                            <div className="flex items-center gap-1.5 px-6 md:px-10 pb-5 md:pb-7">
                                {features.map((f, idx) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => ir(idx)}
                                        aria-label={`Ver destacado ${idx + 1} de ${total}`}
                                        aria-current={idx === i ? "true" : undefined}
                                        className={`pointer-events-auto relative h-1.5 rounded-full overflow-hidden bg-brand-500/25 transition-[width] duration-500 ease-[cubic-bezier(0.34,1.3,0.5,1)] ${idx === i ? "w-8" : "w-1.5 hover:bg-brand-500/50"}`}
                                    >
                                        {idx === i && (
                                            <span key={`${i}-${pausado}`} className={`absolute inset-0 rounded-full bg-brand-500 ${pausado ? "" : "hero-progress"}`}
                                                style={{ "--dur": `${AVANCE_MS}ms` }} />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
