import { resolveImageUrl, imgRetryOnError, toNameCase } from "../../../helpers";

// "Nuestras categorías": la fila de tarjetas que abre la tienda.
//
// Es un atajo, no un filtro más: quien llega sin saber qué busca entra por aquí, y quien ya
// sabe usa el menú o el buscador. Por eso vive solo en la portada —sin búsqueda ni categoría
// activa— y desaparece en cuanto el cliente empieza a filtrar.
//
// Las fotos se cargan por categoría desde el módulo Catálogo. Una categoría sin foto no se
// oculta, pero tampoco se disfraza de foto: antes llevaba una inicial gigante sobre un
// degradado y el mismo velo oscuro de las fotos, y se veía como una imagen que no terminó de
// cargar. Ahora es una tarjeta clara con la inicial en un círculo y el nombre en tinta.
const FLECHA = "M9 5l7 7-7 7";

export default function CategoryStrip({ categories, onPick }) {
    if (!categories?.length) return null;

    // Si ninguna tiene foto, las tarjetas se achatan: el formato vertical solo tiene sentido
    // para lucir una imagen, y vacío dejaba un recuadro alto lleno de nada.
    const conFotos = categories.some((c) => c.image_url);
    const aspecto = conFotos ? "aspect-[4/5]" : "aspect-[3/2]";

    return (
        // pb-8 y no solo el pt-8 de arriba: la sección de abajo (la rejilla de productos)
        // también lleva su propio pt-8, pero eso separa su título de SU contenido, no de lo
        // que viene antes. Sin este margen, las tarjetas terminaban a un dedo del título
        // siguiente y las dos secciones se leían como una sola.
        <section className="max-w-6xl mx-auto px-4 pt-8 md:pt-14 md:pb-8">
            <h2 className="text-[20px] font-bold tracking-tight text-content dark:text-white mb-4">Nuestras categorías</h2>

            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:overflow-visible">
                {categories.map((c) => {
                    const nombre = toNameCase(c.name);
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => onPick(String(c.id))}
                            className="group shrink-0 w-40 sm:w-auto text-left"
                        >
                            <div className={`${aspecto} rounded-2xl overflow-hidden relative border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] transition-colors [@media(hover:hover)]:group-hover:border-content-subtle/40`}>
                                {c.image_url ? (
                                    <>
                                        <img
                                            src={resolveImageUrl(c.image_url)}
                                            alt=""
                                            loading="lazy"
                                            onError={imgRetryOnError}
                                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105"
                                        />
                                        {/* Velo inferior solo sobre foto: sin él, un arte claro deja
                                            el nombre blanco invisible. */}
                                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                                        <span className="absolute bottom-3 left-3 right-3 text-white text-[15px] font-semibold leading-tight line-clamp-2">
                                            {nombre}
                                        </span>
                                    </>
                                ) : (
                                    <div className="absolute inset-0 p-3.5 flex flex-col justify-between">
                                        <span className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center text-[16px] font-semibold select-none">
                                            {nombre.charAt(0)}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-[15px] font-semibold text-content dark:text-white leading-tight line-clamp-2">
                                                {nombre}
                                            </span>
                                            <span className="mt-1 inline-flex items-center gap-0.5 text-[12px] text-content-subtle [@media(hover:hover)]:group-hover:text-brand-600 dark:[@media(hover:hover)]:group-hover:text-brand-400 transition-colors">
                                                Ver productos
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d={FLECHA} />
                                                </svg>
                                            </span>
                                        </span>
                                    </div>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
