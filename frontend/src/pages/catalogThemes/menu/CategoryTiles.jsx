import { resolveImageUrl, imgRetryOnError } from "../../../helpers";

// Pantalla de inicio del tema de menú: mosaicos de categoría, no una rejilla de productos.
// Es el patrón de menú de restaurante con QR en la mesa —"Tipos de comida" primero, platos
// después— y no el de una tienda: aquí nadie entra a buscar un producto suelto, entra a
// decidir qué clase de plato quiere.
//
// El "N productos" y la frase corta vienen resueltos del servidor (getStore ya filtra por
// sucursal), así que esta pantalla no cuenta nada por su cuenta.
export default function CategoryTiles({ categories, onPick }) {
    if (!categories?.length) {
        return (
            <div className="py-24 text-center px-4">
                <p className="text-[14px] font-bold text-white">Todavía no hay nada publicado</p>
                <p className="text-[12px] font-medium text-white/50 mt-1">Vuelve más tarde.</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-6">
            <h2 className="text-[22px] font-black uppercase tracking-tight text-white mb-4">
                Nuestro Menú
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((c) => (
                    // Sin fondo ni borde translúcido: eran un lavado blanco al 4-8%, pensado
                    // para notarse apenas sobre la página oscura fija de antes. Con la página
                    // ahora en el color que elija cada tienda, ese lavado se mezcla distinto
                    // según el color —con un rosa quedaba como un halo rosado alrededor de la
                    // tarjeta— y encima el navegador no siempre lo recorta igual en la esquina
                    // redondeada, así que una tarjeta lo mostraba y la de al lado no, sin
                    // ningún patrón. La sombra no tiene ese problema: no depende de un color
                    // de fondo para leerse y no se ve afectada por cómo el navegador componga
                    // las capas de la foto.
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => onPick(String(c.id))}
                        className="group text-left rounded-2xl overflow-hidden shadow-lg shadow-black/10 hover:shadow-xl transition-shadow"
                    >
                        {/* rounded-t-2xl propio, mismo motivo que rounded-b-2xl en el panel
                            de abajo: no depender solo del recorte del botón exterior. */}
                        <div className="aspect-[4/3] relative overflow-hidden rounded-t-2xl bg-neutral-100">
                            {c.image_url ? (
                                // object-top y no el centrado por defecto: una foto de plato
                                // suele tener lo importante arriba (el plato mismo, no el
                                // mantel), y con imágenes de forma muy distinta entre sí —un
                                // collage cuadrado al lado de una botella alargada— centrar el
                                // recorte dejaba el "VER PRODUCTOS" flotando sobre fondo vacío
                                // en unas y sobre el plato en otras. Arriba es parejo siempre.
                                <img
                                    src={resolveImageUrl(c.image_url)}
                                    alt=""
                                    loading="lazy"
                                    onError={imgRetryOnError}
                                    className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105"
                                />
                            ) : (
                                // Antes era una letra sola, gigante, sobre un cuadro de color
                                // liso: al lado de fotos reales de plato se veía como una
                                // categoría rota, no como "sin foto todavía". El ícono de
                                // bandeja y el texto dicen lo mismo sin la sensación de error.
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-brand-500/10 to-brand-500/20">
                                    <svg className="w-7 h-7 text-brand-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 6a2 2 0 002 2h12a2 2 0 002-2M4 6l1.5 12.5A2 2 0 007.48 20h9.04a2 2 0 001.98-1.5L20 6" /></svg>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-brand-500/50">Sin foto</span>
                                </div>
                            )}
                            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-brand-500 text-white text-[10px] font-black uppercase tracking-wide shadow">
                                Ver productos
                            </span>
                        </div>

                        {/* Colores fijos, no text-content-muted/-subtle: esas dos cambian de
                            valor con el modo claro/oscuro del SISTEMA (son variables CSS que
                            se redefinen bajo .dark), pero este panel es blanco fijo, no
                            oscuro nunca. En un visitante con el teléfono en modo oscuro esas
                            clases se habrían vuelto casi invisibles sobre fondo blanco. */}
                        {/* rounded-b-2xl repetido a propósito: el mosaico ya lo recorta el
                            overflow-hidden del botón exterior, pero con la foto de arriba
                            usando transition-transform (para el zoom al pasar el mouse), el
                            navegador a veces promueve esa foto a su propia capa gráfica y el
                            recorte del contenedor deja de aplicarle bien a la esquina de ESTE
                            panel — se veía una tarjeta con la esquina inferior cuadrada y la
                            de al lado redondeada, sin ningún patrón que explicara cuál. Con
                            el radio puesto también aquí, el panel se recorta a sí mismo y ya
                            no depende de que el recorte del padre alcance bien la esquina. */}
                        <div className="p-4 bg-white rounded-b-2xl">
                            <h3 className="text-[20px] font-black uppercase tracking-tight text-content leading-tight">
                                {c.name}
                            </h3>
                            {c.short_description && (
                                <p className="text-[12px] font-medium text-neutral-500 mt-0.5 line-clamp-1">
                                    {c.short_description}
                                </p>
                            )}
                            <p className="text-[11px] font-bold text-neutral-400 mt-1.5">
                                {c.product_count} {c.product_count === 1 ? "producto" : "productos"}
                            </p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
