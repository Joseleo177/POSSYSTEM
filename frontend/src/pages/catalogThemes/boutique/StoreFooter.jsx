import { resolveImageUrl } from "../../../helpers";
import { getSocialLinks } from "./socialLinks";

// Pie de tienda: identidad, contacto, categorías y redes. Es la última pantalla que ve quien
// bajó del todo sin decidirse, así que repite las dos cosas que hacen falta para comprar —cómo
// escribir y qué hay— en vez de cerrar con una línea de copyright y nada más.
//
// Cada bloque desaparece si la tienda no cargó ese dato: una columna "Contacto" vacía se lee
// como que el negocio no atiende.
export default function StoreFooter({ store, categories, onPickCategory }) {
    const redes = getSocialLinks(store);

    return (
        <footer className="mt-12 border-t border-border/60 dark:border-white/[0.06] bg-surface dark:bg-surface-dark-2">
            <div className="max-w-6xl mx-auto px-4 py-10">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                    <div>
                        {store?.logo_url ? (
                            <img src={resolveImageUrl(store.logo_url)} alt={store.name} className="h-10 w-auto object-contain mb-3" />
                        ) : (
                            <div className="text-[16px] font-black text-content dark:text-white mb-2">{store?.name}</div>
                        )}
                        {store?.slogan && (
                            <p className="text-[11px] font-medium text-content-muted leading-relaxed">{store.slogan}</p>
                        )}

                        {redes.length > 0 && (
                            <div className="flex items-center gap-2 mt-4">
                                {redes.map((r) => (
                                    <a
                                        key={r.label}
                                        href={r.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={r.label}
                                        className="w-9 h-9 rounded-full border border-border/60 dark:border-white/10 flex items-center justify-center text-content-muted hover:text-brand-500 hover:border-brand-500/40 transition-colors"
                                    >
                                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d={r.d} />
                                        </svg>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    {categories?.length > 0 && (
                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-3">Categorías</h3>
                            <ul className="space-y-1.5">
                                {categories.slice(0, 8).map((c) => (
                                    <li key={c.id}>
                                        <button
                                            type="button"
                                            onClick={() => onPickCategory(String(c.id))}
                                            className="text-[12px] font-medium text-content-muted hover:text-brand-500 transition-colors text-left"
                                        >
                                            {c.name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {(store?.phone || store?.address) && (
                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-3">Contacto</h3>
                            {store.phone && (
                                <p className="text-[12px] font-bold text-content dark:text-white">{store.phone}</p>
                            )}
                            {store.address && (
                                <p className="text-[11px] font-medium text-content-muted leading-relaxed mt-1">{store.address}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </footer>
    );
}
