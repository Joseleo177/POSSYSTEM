import { useState, useEffect, useRef } from "react";
import { resolveImageUrl } from "../../../helpers";

// Carrusel de portada. Las imágenes las carga la tienda desde Ajustes → Vitrina, con una
// versión de escritorio y otra de móvil.
//
// El texto de la promoción va DENTRO del arte —lo diseña quien hace la campaña— así que aquí
// no se escribe nada encima: superponer un titular del sistema sobre un banner que ya trae el
// suyo es la forma más rápida de arruinar los dos.
//
// Sin banners cargados no se muestra nada y la tienda abre directo en los productos, que es
// exactamente lo que hace hoy el catálogo estándar.

const AVANCE_MS = 6000;

export default function HeroCarousel({ banners }) {
    const [i, setI] = useState(0);
    const total = banners?.length || 0;
    // El avance automático se pausa cuando alguien toca el carrusel: seguir moviéndolo
    // mientras el cliente mira una promoción es quitarle de las manos lo que estaba leyendo.
    const [pausado, setPausado] = useState(false);
    const tactoX = useRef(null);

    useEffect(() => {
        if (total < 2 || pausado) return;
        const t = setTimeout(() => setI((n) => (n + 1) % total), AVANCE_MS);
        return () => clearTimeout(t);
    }, [i, total, pausado]);

    if (!total) return null;

    const actual = banners[i];

    const ir = (n) => { setI((n + total) % total); setPausado(true); };

    return (
        // En el teléfono va como tarjeta, con aire y esquinas redondeadas: a sangre quedaba
        // pegado a la barra de categorías y se leía como parte de la cabecera. En escritorio
        // sigue a todo el ancho, que es lo que se espera de un carrusel de portada.
        <section
            className="relative mx-3 mt-3 rounded-2xl md:mx-0 md:mt-0 md:rounded-none bg-surface-2 dark:bg-white/[0.03] overflow-hidden"
            onMouseEnter={() => setPausado(true)}
            onMouseLeave={() => setPausado(false)}
            onTouchStart={(e) => { tactoX.current = e.touches[0].clientX; setPausado(true); }}
            onTouchEnd={(e) => {
                if (tactoX.current === null) return;
                const dx = e.changedTouches[0].clientX - tactoX.current;
                // 50px de umbral: por debajo de eso es un toque, no un arrastre.
                if (Math.abs(dx) > 50) ir(dx < 0 ? i + 1 : i - 1);
                tactoX.current = null;
            }}
        >
            {banners.map((b, idx) => (
                <a
                    key={b.id}
                    href={b.link_url || undefined}
                    // Un banner sin enlace no debe comportarse como un enlace: ni cursor de
                    // mano ni foco de teclado para algo que no lleva a ningún lado.
                    tabIndex={b.link_url ? 0 : -1}
                    className={`block transition-opacity duration-500 ${idx === i ? "opacity-100" : "opacity-0 absolute inset-0 pointer-events-none"} ${b.link_url ? "" : "cursor-default"}`}
                    aria-hidden={idx !== i}
                >
                    {/* Dos artes, una por tamaño: recortar el apaisado en un teléfono deja los
                        textos del diseño fuera de cuadro. */}
                    {b.image_mobile_url ? (
                        <picture>
                            <source media="(min-width: 768px)" srcSet={resolveImageUrl(b.image_url)} />
                            <img
                                src={resolveImageUrl(b.image_mobile_url)}
                                alt={b.alt_text || ""}
                                className="w-full h-auto block"
                                loading={idx === 0 ? "eager" : "lazy"}
                            />
                        </picture>
                    ) : (
                        <>
                            <img
                                src={resolveImageUrl(b.image_url)}
                                alt={b.alt_text || ""}
                                className="hidden md:block w-full h-auto"
                                loading={idx === 0 ? "eager" : "lazy"}
                            />
                            {/* Sin arte móvil, el apaisado de escritorio a lo ancho de un
                                teléfono quedaba como una tira baja pegada al menú. Recortarlo
                                para llenar más alto saca de cuadro los textos del diseño, así
                                que va entero y centrado en una caja más alta, con el propio
                                arte desenfocado de fondo rellenando lo que sobra. */}
                            <div className="md:hidden relative aspect-[16/10] overflow-hidden">
                                <img
                                    src={resolveImageUrl(b.image_url)}
                                    alt=""
                                    aria-hidden="true"
                                    className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-80"
                                    loading={idx === 0 ? "eager" : "lazy"}
                                />
                                <img
                                    src={resolveImageUrl(b.image_url)}
                                    alt={b.alt_text || ""}
                                    className="absolute inset-0 w-full h-full object-contain drop-shadow-xl"
                                    loading={idx === 0 ? "eager" : "lazy"}
                                />
                            </div>
                        </>
                    )}
                </a>
            ))}

            {total > 1 && (
                <>
                    <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
                        {banners.map((b, idx) => (
                            <button
                                key={b.id}
                                type="button"
                                onClick={() => ir(idx)}
                                aria-label={`Ver banner ${idx + 1} de ${total}`}
                                className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-white" : "w-1.5 bg-white/60"} shadow`}
                            />
                        ))}
                    </div>

                    {/* Flechas solo donde hay cursor: en un táctil se arrastra, y dos botones
                        encima del arte solo tapan la promoción. */}
                    {["prev", "next"].map((dir) => (
                        <button
                            key={dir}
                            type="button"
                            onClick={() => ir(dir === "next" ? i + 1 : i - 1)}
                            aria-label={dir === "next" ? "Siguiente" : "Anterior"}
                            className={`hidden [@media(hover:hover)]:flex absolute top-1/2 -translate-y-1/2 ${dir === "next" ? "right-3" : "left-3"} w-9 h-9 rounded-full bg-black/25 backdrop-blur text-white items-center justify-center hover:bg-black/40 transition-colors`}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                <path d={dir === "next" ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
                            </svg>
                        </button>
                    ))}
                </>
            )}
        </section>
    );
}
