import useReveal from "./useReveal";

// El bloque entre el carrusel y los productos que dice de qué va la tienda antes de que el
// cliente empiece a mirar precios. Sale del eslogan de la empresa (Ajustes → Empresa) y de
// las frases cortas que la tienda escribe en Ajustes → Vitrina.
//
// Antes era una línea de 13px en el color de la marca, en mayúsculas tal como se escribió,
// perdida entre el carrusel y las categorías: nadie la leía. Ahora tiene dos piezas:
// - El LEMA, en grande, entra palabra por palabra al llegar a él, y su final va en el color de
//   la marca con un trazo a mano que se dibuja debajo. Si no hay eslogan pero sí una sola
//   frase, esa frase pasa a ser el lema: una frase suelta no da para una cinta.
// - La CINTA: las demás frases corriendo en una franja del color de la marca, separadas por
//   un destello.
//
// Sin eslogan y sin frases no hay nada que decir, y la sección entera desaparece.

// Lo escrito todo en mayúsculas se pasa a oración: en grande, las mayúsculas gritan.
// Exportada: el carrusel de destacados (FeatureCarousel) hace lo mismo con sus títulos. La
// mayúscula va en la primera LETRA, no en el primer carácter: "+ RECONSTRUCCIÓN" queda
// "+ Reconstrucción", no "+ reconstrucción".
export const oracion = (t) => {
    const s = String(t || "").trim();
    if (!/\p{L}/u.test(s) || s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/\p{L}/u, (c) => c.toUpperCase());
};

const DESTELLO = "M12 2c.5 4.6 2.4 7.5 7 8.5-4.6 1-6.5 3.9-7 8.5-.5-4.6-2.4-7.5-7-8.5 4.6-1 6.5-3.9 7-8.5z";

const Destello = ({ className = "" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={DESTELLO} />
    </svg>
);

function Lema({ texto }) {
    const [ref, visto] = useReveal();
    const palabras = oracion(texto).split(/\s+/).filter(Boolean);
    // El final resaltado: el último tercio, al menos una palabra. Con una o dos palabras no se
    // parte: todo el lema va en tinta y el trazo subraya la última.
    const corte = palabras.length >= 3 ? palabras.length - Math.max(1, Math.round(palabras.length / 3)) : palabras.length - 1;
    const inicio = palabras.slice(0, corte);
    const final = palabras.slice(corte);
    const retraso = palabras.length * 70 + 250;

    return (
        <section ref={ref} className="max-w-4xl mx-auto px-5 pt-12 md:pt-20 pb-4 md:pb-8 text-center">
            <Destello className={`w-5 h-5 mx-auto mb-5 text-brand-500 ${visto ? "reveal-up" : "opacity-0"}`} />
            <p className="font-display text-[30px] sm:text-[40px] md:text-[52px] font-semibold tracking-[-0.025em] leading-[1.08] text-content dark:text-white text-balance">
                {inicio.map((w, i) => (
                    <span key={i}>
                        <span style={{ "--i": i }} className={visto ? "word-in" : "inline-block opacity-0"}>{w}</span>{" "}
                    </span>
                ))}
                <span className="relative inline-block text-brand-500 whitespace-nowrap">
                    {final.map((w, j) => (
                        <span key={j}>
                            {j > 0 && " "}
                            <span style={{ "--i": corte + j }} className={visto ? "word-in" : "inline-block opacity-0"}>{w}</span>
                        </span>
                    ))}
                    <svg className="absolute left-0 -bottom-[0.18em] w-full h-[0.32em] overflow-visible" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
                        {visto && (
                            <path d="M3 9C48 3 120 1.5 197 6" pathLength="1" fill="none" stroke="currentColor"
                                strokeWidth="3.5" strokeLinecap="round"
                                className="swash-draw" style={{ animationDelay: `${retraso}ms` }} />
                        )}
                    </svg>
                </span>
            </p>
        </section>
    );
}

function Cinta({ frases }) {
    // La cinta corre hasta la mitad y vuelve a empezar sin salto: por eso va dos veces la
    // misma tanda, y cada tanda repite las frases hasta tener con qué llenar una pantalla ancha.
    const veces = Math.max(1, Math.ceil(8 / frases.length));
    const tanda = Array.from({ length: veces }, () => frases).flat();
    const Tanda = ({ oculta }) => (
        <div className="flex shrink-0 items-center" aria-hidden={oculta || undefined}>
            {tanda.map((f, i) => (
                <span key={i} className="flex items-center">
                    <span className="px-6 text-[14px] md:text-[15px] font-medium whitespace-nowrap">{oracion(f)}</span>
                    <Destello className="w-3.5 h-3.5 opacity-80 shrink-0" />
                </span>
            ))}
        </div>
    );

    return (
        <div className="mt-8 md:mt-10 bg-brand-500 text-white overflow-hidden">
            <div className="marquee flex w-max py-3.5" style={{ "--dur": `${tanda.length * 4.5}s` }}>
                <Tanda />
                <Tanda oculta />
            </div>
        </div>
    );
}

export default function BrandStatement({ slogan, highlights }) {
    const frases = highlights?.map((f) => String(f || "").trim()).filter(Boolean) || [];
    const lema = slogan || (frases.length === 1 ? frases[0] : null);
    const cinta = slogan ? frases : (frases.length > 1 ? frases : []);
    if (!lema && cinta.length === 0) return null;

    return (
        <>
            {lema && <Lema texto={lema} />}
            {cinta.length > 0 && <Cinta frases={cinta} />}
        </>
    );
}
