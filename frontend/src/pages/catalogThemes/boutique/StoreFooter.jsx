import StoreLogo from "./StoreLogo";
import { getSocialLinks } from "./socialLinks";

// Pie de tienda: identidad, contacto, categorías y redes. Es la última pantalla que ve quien
// bajó del todo sin decidirse, así que repite las dos cosas que hacen falta para comprar —cómo
// escribir y qué hay— en vez de cerrar con una línea de copyright y nada más.
//
// Cada bloque desaparece si la tienda no cargó ese dato: una columna "Contacto" vacía se lee
// como que el negocio no atiende.
//
// Las categorías van como píldoras y no como lista: con una o dos categorías, una columna de
// enlaces sueltos dejaba el pie con cara de vacío; las píldoras se ven igual de bien con una
// que con diez.

const Icono = ({ d }) => (
    <span className="w-8 h-8 shrink-0 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={d} />
        </svg>
    </span>
);

const Titulo = ({ children }) => (
    <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-content dark:text-white mb-4">{children}</h3>
);

// `pegado`: cuando justo encima va el carrusel de destacados, que ya cierra la página a todo
// el ancho; el margen de siempre dejaba una franja gris suelta entre los dos.
export default function StoreFooter({ store, categories, onPickCategory, pegado = false }) {
    const redes = getSocialLinks(store);
    const anio = new Date().getFullYear();
    const hayContacto = store?.phone || store?.address || store?.whatsapp;

    return (
        <footer className={`${pegado ? "" : "mt-12"} bg-surface dark:bg-surface-dark-2 border-t border-border/60 dark:border-white/[0.06]`}>
            {/* Filo del color de la marca: separa el pie del contenido sin otra raya gris más. */}
            <div className="h-1 bg-gradient-to-r from-brand-500/0 via-brand-500 to-brand-500/0" />

            <div className="max-w-6xl mx-auto px-5 pt-12 pb-10">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
                    {/* Marca */}
                    <div className="md:col-span-5">
                        {store?.logo_url ? (
                            <StoreLogo store={store} className="h-14 w-auto max-w-[240px]" />
                        ) : (
                            <div className="text-[20px] font-black text-content dark:text-white">{store?.name}</div>
                        )}
                        {store?.slogan && (
                            <p className="mt-4 text-[13px] font-medium text-content-muted leading-relaxed max-w-sm">{store.slogan}</p>
                        )}

                        {redes.length > 0 && (
                            <div className="flex items-center gap-2 mt-5">
                                {redes.map((r) => (
                                    <a
                                        key={r.label}
                                        href={r.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={r.label}
                                        className="w-10 h-10 rounded-full bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content dark:text-white hover:bg-brand-500 hover:text-white transition-colors"
                                    >
                                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d={r.d} />
                                        </svg>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Categorías */}
                    {categories?.length > 0 && (
                        <div className="md:col-span-3">
                            <Titulo>Comprar</Titulo>
                            <div className="flex flex-wrap gap-2">
                                {categories.slice(0, 10).map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => { onPickCategory(String(c.id)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                                        className="h-8 px-3.5 rounded-full border border-border/70 dark:border-white/10 text-[11px] font-bold uppercase tracking-wide text-content-muted hover:border-brand-500 hover:text-brand-500 transition-colors"
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Contacto */}
                    {hayContacto && (
                        <div className="md:col-span-4">
                            <Titulo>Contacto</Titulo>
                            <ul className="space-y-3">
                                {store.phone && (
                                    <li className="flex items-center gap-3">
                                        <Icono d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                        <span className="text-[13px] font-bold text-content dark:text-white">{store.phone}</span>
                                    </li>
                                )}
                                {store.address && (
                                    <li className="flex items-start gap-3">
                                        <Icono d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <span className="text-[12px] font-medium text-content-muted leading-relaxed pt-1.5">{store.address}</span>
                                    </li>
                                )}
                            </ul>
                            {store.whatsapp && (
                                <a
                                    href={`https://wa.me/${store.whatsapp}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-full bg-brand-500 text-white text-[11px] font-black uppercase tracking-widest hover:brightness-110 transition active:scale-95"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                    Escríbenos
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="border-t border-border/60 dark:border-white/[0.06]">
                <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
                    <p className="text-[11px] font-medium text-content-subtle truncate">
                        © {anio} {store?.name}
                    </p>
                    <button
                        type="button"
                        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                        className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-content-muted hover:text-brand-500 transition-colors"
                    >
                        Volver arriba
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                    </button>
                </div>
            </div>
        </footer>
    );
}
