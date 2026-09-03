import { resolveImageUrl, imgRetryOnError } from "../../../helpers";

// "Nuestras categorías": la fila de tarjetas con foto que abre la tienda.
//
// Es un atajo, no un filtro más: quien llega sin saber qué busca entra por aquí, y quien ya
// sabe usa el menú o el buscador. Por eso vive solo en la portada —sin búsqueda ni categoría
// activa— y desaparece en cuanto el cliente empieza a filtrar.
//
// Las fotos se cargan por categoría desde el módulo Catálogo. Una categoría sin foto no se
// oculta: se muestra con su inicial sobre el color de la marca, para que la fila no quede
// con huecos mientras la tienda termina de cargar las imágenes.
export default function CategoryStrip({ categories, onPick }) {
    if (!categories?.length) return null;

    return (
        // pb-8 y no solo el pt-8 de arriba: la sección de abajo (la rejilla de productos)
        // también lleva su propio pt-8, pero eso separa su título de SU contenido, no de lo
        // que viene antes. Sin este margen, las fotos de categoría terminaban a un dedo del
        // título "Todos los productos" y las dos secciones se leían como una sola.
        <section className="max-w-6xl mx-auto px-4 pt-8 pb-8">
            <h2 className="text-[15px] font-black text-content dark:text-white mb-3">Nuestras categorías</h2>

            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:overflow-visible">
                {categories.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => onPick(String(c.id))}
                        className="group shrink-0 w-36 sm:w-auto text-left"
                    >
                        <div className="aspect-[4/5] rounded-2xl overflow-hidden bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] relative">
                            {c.image_url ? (
                                <img
                                    src={resolveImageUrl(c.image_url)}
                                    alt=""
                                    loading="lazy"
                                    onError={imgRetryOnError}
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-500/10 to-brand-500/25">
                                    <span className="text-4xl font-black text-brand-500/40 select-none">{c.name.charAt(0)}</span>
                                </div>
                            )}
                            {/* Velo inferior para que el nombre se lea sobre cualquier foto:
                                sin él, un arte claro deja el texto blanco invisible. */}
                            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent" />
                            <span className="absolute bottom-2.5 left-3 right-3 text-white text-[12px] font-black uppercase tracking-wide leading-tight line-clamp-2">
                                {c.name}
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </section>
    );
}
