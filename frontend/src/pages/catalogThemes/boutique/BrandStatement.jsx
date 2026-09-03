// El bloque entre el carrusel y los productos que dice de qué va la tienda antes de que el
// cliente empiece a mirar precios. Es lo que separaba a las tiendas de referencia de una
// rejilla de productos genérica: en Milagros es "EXPERTOS EN REPARACIÓN · ANTICAÍDA ·
// CRECIMIENTO"; aquí es el eslogan de la empresa (ya se carga en Ajustes → Empresa, pero
// hasta ahora nadie lo mostraba en la vitrina) más unas frases cortas que la tienda escribe
// en Ajustes → Vitrina.
//
// Sin eslogan y sin frases no hay nada que decir, así que la sección entera desaparece: un
// espacio en blanco con una raya divisoria en medio es peor que no tener el bloque.
export default function BrandStatement({ slogan, highlights }) {
    const frases = highlights?.filter(Boolean) || [];
    if (!slogan && frases.length === 0) return null;

    return (
        <section className="max-w-4xl mx-auto px-4 pt-10 pb-2 text-center">
            {slogan && (
                <p className="text-[20px] sm:text-[24px] font-bold text-content dark:text-white leading-snug">
                    {slogan}
                </p>
            )}

            {frases.length > 0 && (
                // `divide-x` en vez de un separador armado a mano: con flex-wrap, un punto
                // metido entre cada frase como hijo propio duplicaba el espaciado en la
                // frase que le tocaba envolver a otra línea. Los bordes de `divide` no tienen
                // ese problema porque no ocupan una celda del flex.
                <div className={`flex flex-wrap items-center justify-center divide-x divide-border dark:divide-white/15 ${slogan ? "mt-3" : ""}`}>
                    {frases.map((f) => (
                        <span key={f} className="px-3 py-0.5 text-[11px] font-black uppercase tracking-widest text-brand-500">
                            {f}
                        </span>
                    ))}
                </div>
            )}
        </section>
    );
}
