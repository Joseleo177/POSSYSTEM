// Testimonios de clientes. La sección NO se dibuja mientras la lista esté vacía.
//
// Solo van testimonios reales, con el permiso de quien los dio: una opinión inventada en la
// portada es engañar a quien está decidiendo. Para agregar uno:
//   { cita: "Lo que dijo, con sus palabras", nombre: "Nombre", negocio: "Negocio · rubro" }

const TESTIMONIOS = [];

export default function LandingTestimonios() {
    if (!TESTIMONIOS.length) return null;

    return (
        <section className="border-t border-border/50 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24">
                <p className="text-[14px] font-semibold text-brand-600 dark:text-brand-400">Lo que dicen quienes lo usan</p>
                <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {TESTIMONIOS.map(t => (
                        <figure key={t.nombre} className="rounded-2xl border border-border/70 dark:border-white/[0.08] bg-surface-2/50 dark:bg-white/[0.02] p-6 flex flex-col">
                            <blockquote className="flex-1 text-[15px] text-content dark:text-white/90 leading-relaxed">“{t.cita}”</blockquote>
                            <figcaption className="mt-5 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                                <p className="text-[14px] font-semibold text-content dark:text-white">{t.nombre}</p>
                                <p className="text-[13px] text-content-subtle">{t.negocio}</p>
                            </figcaption>
                        </figure>
                    ))}
                </div>
            </div>
        </section>
    );
}
