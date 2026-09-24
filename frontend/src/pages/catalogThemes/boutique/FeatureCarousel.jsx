import { useState, useEffect, useRef } from "react";
import { resolveImageUrl } from "../../../helpers";

// Carrusel de destacados, al final de la portada: la imagen de un lado y, del otro, lo que la
// tienda quiere contar de ese producto o línea ("Ideal para reconstrucción inmediata…").
//
// Es el contrapunto del carrusel de portada. Allá el mensaje va dentro del arte porque es una
// campaña; aquí el texto lo escribe el comercio en Ajustes → Vitrina y lo pinta la vitrina,
// así que se lee igual de bien en cualquier pantalla y se cambia sin rehacer la imagen.
//
// Se cierra la portada con esto antes del pie: quien llegó hasta abajo sin decidirse ya vio
// los precios, y lo que le falta es una razón.

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
        <section
            className="mt-10 md:mt-16 bg-surface dark:bg-surface-dark-2 border-t border-border/60 dark:border-white/[0.06]"
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
            {/* Una sola rejilla y las diapositivas apiladas en la misma celda: así la sección
                toma la altura de la más alta y no salta al cambiar de una con texto corto a
                otra con texto largo. */}
            <div className="grid">
                {features.map((f, idx) => {
                    const activo = idx === i;
                    return (
                        <div
                            key={f.id}
                            className={`col-start-1 row-start-1 grid grid-cols-1 md:grid-cols-2 transition-opacity duration-700 ${activo ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                            aria-hidden={!activo}
                        >
                            {/* En el teléfono la imagen va primero: es lo que detiene el dedo. */}
                            <div className="md:order-2 relative aspect-[16/10] md:aspect-auto md:min-h-[440px] overflow-hidden bg-surface-2 dark:bg-white/[0.03]">
                                <img
                                    src={resolveImageUrl(f.image_url)}
                                    alt={f.alt_text || f.heading || ""}
                                    className={`absolute inset-0 w-full h-full object-cover transition-transform duration-[7000ms] ease-out ${activo ? "scale-105" : "scale-100"}`}
                                    loading="lazy"
                                />
                            </div>

                            <div className="md:order-1 flex flex-col items-center justify-center text-center px-6 py-8 md:px-14 md:py-16">
                                {f.heading && (
                                    <h2 className="text-[22px] sm:text-[26px] md:text-[34px] font-black text-content dark:text-white leading-[1.15] tracking-tight max-w-[520px]">
                                        {f.heading}
                                    </h2>
                                )}
                                {f.body && (
                                    <p className={`text-[13px] md:text-[14px] font-medium text-content-muted leading-relaxed max-w-[480px] ${f.heading ? "mt-4" : ""}`}>
                                        {f.body}
                                    </p>
                                )}
                                {f.link_url && (
                                    <a
                                        href={f.link_url}
                                        tabIndex={activo ? 0 : -1}
                                        className="mt-6 inline-flex items-center gap-1.5 h-10 px-6 rounded-full bg-brand-500 text-white text-[11px] font-black uppercase tracking-widest hover:brightness-110 transition active:scale-95"
                                    >
                                        Ver más
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                    </a>
                                )}
                                {/* Hueco reservado para los puntos, que van fuera de la
                                    diapositiva para no desvanecerse con ella. */}
                                {total > 1 && <div className="h-10 md:h-12" aria-hidden="true" />}
                            </div>
                        </div>
                    );
                })}

                {total > 1 && (
                    // Bajo el texto: en escritorio sobre la mitad izquierda, en el teléfono al
                    // pie de la sección.
                    <div className="col-start-1 row-start-1 self-end grid grid-cols-1 md:grid-cols-2 pointer-events-none">
                        <div className="flex items-center justify-center gap-1.5 pb-6 md:pb-10">
                            {features.map((f, idx) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => ir(idx)}
                                    aria-label={`Ver destacado ${idx + 1} de ${total}`}
                                    className={`pointer-events-auto h-1.5 rounded-full transition-all ${idx === i ? "w-7 bg-brand-500" : "w-1.5 bg-brand-500/30 hover:bg-brand-500/60"}`}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
