import { useState, useEffect, useRef } from "react";
import { resolveImageUrl } from "../../../helpers";

// Carrusel de portada. Las imágenes las carga la tienda desde Ajustes → Vitrina, con una
// versión de escritorio y otra de móvil.
//
// El texto de la promoción va DENTRO del arte —lo diseña quien hace la campaña— así que aquí
// no se escribe nada encima: superponer un titular del sistema sobre un banner que ya trae el
// suyo es la forma más rápida de arruinar los dos.
//
// En escritorio ya no va a todo el ancho de la pantalla: a 1920px un arte apaisado medía más
// de 600px de alto y tapaba la tienda entera antes de mostrar un solo producto. Ahora va
// dentro del ancho de la página, como una pieza con esquinas grandes, y a su alto natural (sin
// recortar: el arte trae textos). Lo que lo hace vivo es el movimiento: la foto activa se
// acerca despacio (Ken Burns), los banners se cruzan en fundido y el indicador del activo se
// llena durante lo que dura, para que se sepa cuándo viene el siguiente.
//
// Sin banners cargados no se muestra nada y la tienda abre directo en los productos.

const AVANCE_MS = 6000;

export default function HeroCarousel({ banners }) {
    const [i, setI] = useState(0);
    const total = banners?.length || 0;
    // El avance automático se pausa cuando alguien toca el carrusel: seguir moviéndolo
    // mientras el cliente mira una promoción es quitarle de las manos lo que estaba leyendo.
    const [pausado, setPausado] = useState(false);
    // Cuántas veces se activó cada banner: su foto se vuelve a montar con cada activación
    // para que el acercamiento empiece de cero, y la que sale conserva el suyo mientras se
    // desvanece (sin el salto de volver de golpe a su tamaño).
    const [veces, setVeces] = useState({});
    const tactoX = useRef(null);

    useEffect(() => {
        if (total < 2 || pausado) return;
        const t = setTimeout(() => setI((n) => (n + 1) % total), AVANCE_MS);
        return () => clearTimeout(t);
    }, [i, total, pausado]);

    useEffect(() => { setVeces((v) => ({ ...v, [i]: (v[i] || 0) + 1 })); }, [i]);

    if (!total) return null;

    const ir = (n) => { setI((n + total) % total); setPausado(true); };

    return (
        <div className="max-w-6xl mx-auto px-3 md:px-4 pt-3 md:pt-6">
            <section
                className="group/hero relative rounded-2xl md:rounded-[28px] overflow-hidden isolate bg-surface-2 dark:bg-white/[0.03] shadow-[0_24px_60px_-30px_rgba(0,0,0,.45)]"
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
                        className={`block overflow-hidden transition-opacity duration-700 ease-out ${idx === i ? "opacity-100 relative z-[1]" : "opacity-0 absolute inset-0 pointer-events-none"} ${b.link_url ? "" : "cursor-default"}`}
                        aria-hidden={idx !== i}
                    >
                        <div key={veces[idx] || 0} className={total > 1 ? "hero-zoom" : ""}>
                            {/* Dos artes, una por tamaño: recortar el apaisado en un teléfono
                                deja los textos del diseño fuera de cuadro. */}
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
                                    {/* Sin arte móvil, el apaisado entero y centrado en una
                                        caja más alta, con el propio arte desenfocado de fondo
                                        rellenando lo que sobra: recortarlo saca de cuadro los
                                        textos del diseño. */}
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
                        </div>
                    </a>
                ))}

                {total > 1 && (
                    <>
                        {/* Indicadores en una cápsula de vidrio: el activo es más largo y se
                            llena durante lo que dura el banner. En pausa (cursor encima) queda
                            lleno y quieto. */}
                        <div className="absolute z-[2] bottom-3 md:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-2 rounded-full bg-black/20 backdrop-blur-md ring-1 ring-white/15">
                            {banners.map((b, idx) => (
                                <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => ir(idx)}
                                    aria-label={`Ver banner ${idx + 1} de ${total}`}
                                    aria-current={idx === i ? "true" : undefined}
                                    className={`relative h-1.5 rounded-full overflow-hidden bg-white/40 transition-[width] duration-500 ease-[cubic-bezier(0.34,1.3,0.5,1)] ${idx === i ? "w-8" : "w-1.5 hover:bg-white/70"}`}
                                >
                                    {idx === i && (
                                        <span
                                            key={`${i}-${pausado}`}
                                            className={`absolute inset-0 rounded-full bg-white ${pausado ? "" : "hero-progress"}`}
                                            style={{ "--dur": `${AVANCE_MS}ms` }}
                                        />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Flechas solo donde hay cursor, y solo al pasar sobre el banner: en
                            un táctil se arrastra, y dos botones fijos encima del arte tapan la
                            promoción. */}
                        {["prev", "next"].map((dir) => (
                            <button
                                key={dir}
                                type="button"
                                onClick={() => ir(dir === "next" ? i + 1 : i - 1)}
                                aria-label={dir === "next" ? "Siguiente" : "Anterior"}
                                className={`hidden [@media(hover:hover)]:flex absolute z-[2] top-1/2 -translate-y-1/2 ${dir === "next" ? "right-4 translate-x-2" : "left-4 -translate-x-2"} w-11 h-11 rounded-full bg-white/25 backdrop-blur-md ring-1 ring-white/40 text-white items-center justify-center opacity-0 group-hover/hero:opacity-100 group-hover/hero:translate-x-0 hover:bg-white/40 hover:scale-105 active:scale-95 transition-[opacity,transform,background-color] duration-300 shadow-lg`}
                            >
                                <svg className="w-5 h-5 drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                                    <path d={dir === "next" ? "M10 6l6 6-6 6" : "M14 6l-6 6 6 6"} />
                                </svg>
                            </button>
                        ))}
                    </>
                )}
            </section>
        </div>
    );
}
