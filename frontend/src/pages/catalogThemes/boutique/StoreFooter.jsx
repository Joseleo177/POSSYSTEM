import StoreLogo from "./StoreLogo";
import { getSocialLinks } from "./socialLinks";
import { toNameCase } from "../../../helpers";

// Pie de tienda: una sola franja, no un bloque de tres columnas.
//
// El pie anterior repetía las categorías en píldoras (ya están en la cabecera, siempre a la
// vista porque es fija), ponía títulos "Comprar" y "Contacto" y cerraba con otra franja para el
// copyright: unos 330px de pie genérico para decir cuatro datos. Ahora va todo en una línea en
// escritorio —marca y dónde está a la izquierda; redes, WhatsApp y volver arriba a la derecha—
// y apilado y centrado en el teléfono.
//
// Cada pieza desaparece si la tienda no cargó ese dato.

const PIN = "M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z";
const TEL = "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z";
const CHAT = "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z";

const Ico = ({ d, className = "w-3.5 h-3.5" }) => (
    <svg className={`${className} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);

// `pegado`: cuando justo encima va el carrusel de destacados, que ya cierra la página a todo
// el ancho; el margen de siempre dejaba una franja gris suelta entre los dos.
// `flotantes`: la tienda tiene el carrito (y WhatsApp) flotando abajo a la derecha. Antes eso
// se resolvía con una franja vacía de 96px DEBAJO del pie, en todas las pantallas: en
// escritorio el pie se veía el doble de alto sin razón. Ahora el pie se cuida solo: en el
// teléfono reserva abajo el alto de las burbujas (dentro del mismo pie, que es lo que quedaba
// tapado), y en escritorio mediano corre sus botones a la izquierda del carrito; desde 2xl el
// margen lateral de la página ya los separa.
export default function StoreFooter({ store, pegado = false, flotantes = false }) {
    const redes = getSocialLinks(store);
    const anio = new Date().getFullYear();
    const nombre = toNameCase(store?.name || "");

    return (
        <footer className={`${pegado ? "" : "mt-12"} bg-surface dark:bg-surface-dark-2 border-t border-border/60 dark:border-white/[0.06] ${flotantes ? "pb-24 md:pb-0" : ""}`}>
            <div className={`max-w-6xl mx-auto px-5 py-7 md:py-5 flex flex-col md:flex-row items-center gap-5 md:gap-8 text-center md:text-left ${flotantes ? "md:pr-52 2xl:pr-5" : ""}`}>
                <div className="min-w-0 flex flex-col md:flex-row items-center gap-3 md:gap-6">
                    {store?.logo_url ? (
                        <StoreLogo store={store} className="h-10 w-auto max-w-[180px]" />
                    ) : (
                        <span className="font-display text-[18px] font-bold tracking-tight text-content dark:text-white">{nombre}</span>
                    )}
                    <div className="min-w-0 flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1 text-[12px] text-content-subtle">
                        {store?.address && (
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                                <Ico d={PIN} />
                                <span className="truncate max-w-[260px]">{store.address}</span>
                            </span>
                        )}
                        {store?.phone && (
                            <a href={`tel:${store.phone}`} className="inline-flex items-center gap-1.5 hover:text-content dark:hover:text-white transition-colors tabular-nums">
                                <Ico d={TEL} />
                                {store.phone}
                            </a>
                        )}
                        <span>© {anio} {nombre}</span>
                    </div>
                </div>

                <div className="md:ml-auto flex items-center gap-2">
                    {redes.map((r) => (
                        <a
                            key={r.label}
                            href={r.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={r.label}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-content-muted hover:text-brand-500 hover:bg-brand-500/10 transition-colors"
                        >
                            <Ico d={r.d} className="w-[17px] h-[17px]" />
                        </a>
                    ))}
                    {store?.whatsapp && (
                        <a
                            href={`https://wa.me/${store.whatsapp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-9 px-4 rounded-full border border-border dark:border-white/10 inline-flex items-center gap-2 text-[13px] font-semibold text-content dark:text-white hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        >
                            <Ico d={CHAT} className="w-4 h-4" />
                            Escríbenos
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                        aria-label="Volver arriba"
                        className="group w-9 h-9 rounded-full bg-content dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center overflow-hidden transition-transform active:scale-90"
                    >
                        {/* La flecha sale por arriba y vuelve a entrar por abajo al pasar el
                            cursor: el botón "dice" hacia dónde lleva. */}
                        <svg className="w-4 h-4 [@media(hover:hover)]:group-hover:animate-[footer-up_.5s_cubic-bezier(.2,.8,.2,1)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                    </button>
                </div>
            </div>
        </footer>
    );
}
